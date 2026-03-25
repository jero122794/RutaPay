// frontend/app/(dashboard)/treasury/page.tsx
"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";
import TablePagination from "../../../components/ui/TablePagination";
import { getBogotaYMD } from "../../../lib/bogota";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatCOP } from "../../../lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface RouteItem {
  id: string;
  name: string;
  managerId: string;
  managerName: string;
  balance: number;
}

interface LiquidationRouteRow {
  routeId: string;
  routeName: string;
  cashInRoute: number;
  activePortfolio: number;
  collectedOnDate: number;
  lentPrincipalOnDate: number;
  overdueInstallmentsOutstanding: number;
}

interface LiquidationFrequencyRow {
  frequency: string;
  label: string;
  collectedOnDate: number;
  lentPrincipalOnDate: number;
  activeLoansCount: number;
  overdueInstallmentsOutstanding: number;
}

interface LiquidationResponse {
  managerId: string;
  routeId: string;
  routeName: string;
  assignedBalance: number;
  currentBalance: number;
  recoveredPayments: number;
  activePortfolio: number;
  amountToReturn: number;
  asOfDate: string;
  totalsOnDate: {
    collected: number;
    lentPrincipal: number;
  };
  byRoute: LiquidationRouteRow[];
  byFrequency: LiquidationFrequencyRow[];
}

type LiquidationReviewStatus = "NOT_SUBMITTED" | "SUBMITTED" | "APPROVED" | "REJECTED";

interface LiquidationReviewRow {
  managerId: string;
  managerName: string;
  businessDate: string;
  collectedOnDate: number;
  lentPrincipalOnDate: number;
  netCashflowDay: number;
  cashInRoutes: number;
  availableToLend: number;
  reviewStatus: LiquidationReviewStatus;
  managerNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
}

interface LiquidationReviewsListResponse {
  data: LiquidationReviewRow[];
  total: number;
  page: number;
  limit: number;
}

const liquidationReviewStatusLabel = (status: LiquidationReviewStatus): string => {
  switch (status) {
    case "NOT_SUBMITTED":
      return "Sin enviar";
    case "SUBMITTED":
      return "En revisión";
    case "APPROVED":
      return "Aprobada";
    case "REJECTED":
      return "Rechazada";
    default:
      return status;
  }
};

interface LiquidationDashboardProps {
  data: LiquidationResponse;
}

/** Simplified day summary for route managers (recaudo, prestado, saldo en caja). */
const RouteManagerLiquidationSimple = ({ data }: LiquidationDashboardProps): JSX.Element => {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-textSecondary">
        Fecha operativa (Bogotá): <span className="font-medium text-textPrimary">{data.asOfDate}</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Recaudado hoy</p>
          <p className="mt-2 text-lg font-semibold text-textPrimary">{formatCOP(data.totalsOnDate.collected)}</p>
          <p className="mt-1 text-xs text-textSecondary">Pagos registrados en el día</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Prestado hoy</p>
          <p className="mt-2 text-lg font-semibold text-textPrimary">{formatCOP(data.totalsOnDate.lentPrincipal)}</p>
          <p className="mt-1 text-xs text-textSecondary">Capital de préstamos creados hoy</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Quedó en caja (saldo ruta)</p>
          <p className="mt-2 text-lg font-semibold text-primary">{formatCOP(data.currentBalance)}</p>
          <p className="mt-1 text-xs text-textSecondary">Saldo actual en tu ruta</p>
        </div>
      </div>
    </div>
  );
};

const LiquidationDashboard = ({ data }: LiquidationDashboardProps): JSX.Element => {
  const totalMora = useMemo(
    () => data.byRoute.reduce((s, r) => s + r.overdueInstallmentsOutstanding, 0),
    [data.byRoute]
  );
  const [routePage, setRoutePage] = useState(1);
  const [routeLimit, setRouteLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [frequencyPage, setFrequencyPage] = useState(1);
  const [frequencyLimit, setFrequencyLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const pagedByRoute = useMemo(() => {
    const start = (routePage - 1) * routeLimit;
    return data.byRoute.slice(start, start + routeLimit);
  }, [data.byRoute, routePage, routeLimit]);

  const pagedByFrequency = useMemo(() => {
    const start = (frequencyPage - 1) * frequencyLimit;
    return data.byFrequency.slice(start, start + frequencyLimit);
  }, [data.byFrequency, frequencyPage, frequencyLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(data.byRoute.length / routeLimit));
    if (routePage > totalPages) {
      setRoutePage(totalPages);
    }
  }, [data.byRoute.length, routeLimit, routePage]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(data.byFrequency.length / frequencyLimit));
    if (frequencyPage > totalPages) {
      setFrequencyPage(totalPages);
    }
  }, [data.byFrequency.length, frequencyLimit, frequencyPage]);

  return (
    <div className="mt-4 space-y-6">
      <p className="text-sm text-textSecondary">
        Fecha operativa (Bogotá):{" "}
        <span className="font-medium text-textPrimary">{data.asOfDate}</span>
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Recaudo del día</p>
          <p className="mt-2 text-lg font-semibold text-textPrimary">{formatCOP(data.totalsOnDate.collected)}</p>
          <p className="mt-1 text-xs text-textSecondary">Pagos registrados ese día (activos)</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Capital prestado (día)</p>
          <p className="mt-2 text-lg font-semibold text-textPrimary">
            {formatCOP(data.totalsOnDate.lentPrincipal)}
          </p>
          <p className="mt-1 text-xs text-textSecondary">Suma de capital en préstamos creados ese día</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Mora (cuotas vencidas)</p>
          <p className="mt-2 text-lg font-semibold text-warning">{formatCOP(totalMora)}</p>
          <p className="mt-1 text-xs text-textSecondary">Saldo pendiente en cuotas OVERDUE</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Balance asignado (hist.)</p>
          <p className="mt-2 text-lg font-semibold">{formatCOP(data.assignedBalance)}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Caja en rutas (saldo)</p>
          <p className="mt-2 text-lg font-semibold">{formatCOP(data.currentBalance)}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Recaudo histórico</p>
          <p className="mt-2 text-lg font-semibold">{formatCOP(data.recoveredPayments)}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">Cartera activa</p>
          <p className="mt-2 text-lg font-semibold">{formatCOP(data.activePortfolio)}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-4">
          <p className="text-xs uppercase tracking-wider text-textSecondary">A devolver (referencial)</p>
          <p className="mt-2 text-lg font-semibold text-success">{formatCOP(data.amountToReturn)}</p>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-textPrimary">Por ruta</h3>
        <div className="mt-2 rutapay-table-wrap">
          <table className="rutapay-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Ruta
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Caja
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Cartera activa
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Recaudo día
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Prestado día
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Mora
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedByRoute.map((r) => (
                <tr key={r.routeId} className="border-t border-border">
                  <td className="px-3 py-3 text-sm font-medium text-textPrimary">{r.routeName}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatCOP(r.cashInRoute)}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatCOP(r.activePortfolio)}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatCOP(r.collectedOnDate)}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatCOP(r.lentPrincipalOnDate)}</td>
                  <td className="px-3 py-3 text-right text-sm text-warning">
                    {formatCOP(r.overdueInstallmentsOutstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.byRoute.length > 0 ? (
          <TablePagination
            page={routePage}
            limit={routeLimit}
            total={data.byRoute.length}
            onPageChange={setRoutePage}
            onLimitChange={(next) => {
              setRouteLimit(next);
              setRoutePage(1);
            }}
          />
        ) : null}
      </div>

      <div>
        <h3 className="text-base font-semibold text-textPrimary">Por tipo de cuota</h3>
        <p className="mt-1 text-xs text-textSecondary">
          Diaria, semanal, quincenal y mensual según la frecuencia del préstamo. No hay cuota &quot;manual&quot; en el
          modelo actual.
        </p>
        <div className="mt-2 rutapay-table-wrap">
          <table className="rutapay-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Frecuencia
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Recaudo día
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Prestado día
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Préstamos activos
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                  Mora
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedByFrequency.map((row) => (
                <tr key={row.frequency} className="border-t border-border">
                  <td className="px-3 py-3 text-sm text-textPrimary">{row.label}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatCOP(row.collectedOnDate)}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatCOP(row.lentPrincipalOnDate)}</td>
                  <td className="px-3 py-3 text-right text-sm">{row.activeLoansCount}</td>
                  <td className="px-3 py-3 text-right text-sm text-warning">
                    {formatCOP(row.overdueInstallmentsOutstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.byFrequency.length > 0 ? (
          <TablePagination
            page={frequencyPage}
            limit={frequencyLimit}
            total={data.byFrequency.length}
            onPageChange={setFrequencyPage}
            onLimitChange={(next) => {
              setFrequencyLimit(next);
              setFrequencyPage(1);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

interface UserItem {
  id: string;
  name: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const creditSchema = z.object({
  routeId: z.string().min(1),
  amount: z.number().int().positive(),
  reference: z.string().max(200).optional().or(z.literal(""))
});

type CreditFormValues = z.infer<typeof creditSchema>;

const TreasuryPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const queryClient = useQueryClient();

  const isAdminView = role === "ADMIN" || role === "SUPER_ADMIN";
  const isRouteManagerView = role === "ROUTE_MANAGER";

  const [routesPage, setRoutesPage] = useState(1);
  const [routesLimit, setRoutesLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const routesTableQuery = useQuery({
    queryKey: ["routes-treasury", routesPage, routesLimit],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes", {
        params: { page: routesPage, limit: routesLimit }
      });
      return response.data;
    },
    enabled: isAdminView
  });

  const routesAllQuery = useQuery({
    queryKey: ["routes-treasury-all"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: isAdminView
  });

  useEffect(() => {
    const body = routesTableQuery.data;
    if (!body) return;
    if (body.page !== routesPage) {
      setRoutesPage(body.page);
    }
  }, [routesTableQuery.data, routesPage]);

  const managerIds = useMemo((): string[] => {
    if (!routesAllQuery.data) return [];
    const ids = routesAllQuery.data.data.map((r) => r.managerId);
    return Array.from(new Set(ids));
  }, [routesAllQuery.data]);

  const usersQuery = useQuery({
    queryKey: ["users-for-treasury-manager-select"],
    queryFn: async (): Promise<ListResponse<UserItem>> => {
      const response = await api.get<ListResponse<UserItem>>("/users");
      return response.data;
    },
    enabled: isAdminView
  });

  const managerNameById = useMemo((): Record<string, string> => {
    const map: Record<string, string> = {};
    const routes = routesAllQuery.data?.data ?? [];
    routes.forEach((r) => {
      if (r.managerName) {
        map[r.managerId] = r.managerName;
      }
    });
    const users = usersQuery.data?.data ?? [];
    users.forEach((u) => {
      if (!map[u.id]) {
        map[u.id] = u.name;
      }
    });
    return map;
  }, [routesAllQuery.data, usersQuery.data]);

  const [selectedManagerId, setSelectedManagerId] = useState<string>("");
  const [liquidationDate, setLiquidationDate] = useState<string>(() => getBogotaYMD());
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewLimit, setReviewLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [managerCloseNote, setManagerCloseNote] = useState("");

  const liquidationSubjectId = isAdminView ? selectedManagerId : user?.id ?? "";

  const liquidationDetailQuery = useQuery({
    queryKey: ["treasury-liquidation", liquidationSubjectId, liquidationDate],
    queryFn: async (): Promise<{ data: LiquidationResponse }> => {
      const response = await api.get<{ data: LiquidationResponse }>(
        `/treasury/liquidation/${liquidationSubjectId}`,
        {
          params: { date: liquidationDate }
        }
      );
      return response.data;
    },
    enabled:
      Boolean(liquidationSubjectId) &&
      (isAdminView ? Boolean(selectedManagerId) : isRouteManagerView)
  });

  const liquidationReviewsListQuery = useQuery({
    queryKey: ["treasury-liquidation-reviews", liquidationDate, reviewPage, reviewLimit],
    queryFn: async (): Promise<LiquidationReviewsListResponse> => {
      const response = await api.get<LiquidationReviewsListResponse>("/treasury/liquidation-reviews", {
        params: { date: liquidationDate, page: reviewPage, limit: reviewLimit }
      });
      return response.data;
    },
    enabled: isAdminView
  });

  const myLiquidationReviewQuery = useQuery({
    queryKey: ["treasury-liquidation-review-me", liquidationDate, user?.id ?? ""],
    queryFn: async (): Promise<{ data: LiquidationReviewRow }> => {
      const response = await api.get<{ data: LiquidationReviewRow }>("/treasury/liquidation-reviews/me", {
        params: { date: liquidationDate }
      });
      return response.data;
    },
    enabled: isRouteManagerView && Boolean(user?.id)
  });

  useEffect(() => {
    const body = liquidationReviewsListQuery.data;
    if (!body) return;
    if (body.page !== reviewPage) setReviewPage(body.page);
  }, [liquidationReviewsListQuery.data, reviewPage]);

  useEffect(() => {
    const row = myLiquidationReviewQuery.data?.data;
    if (!row || row.businessDate !== liquidationDate) return;
    setManagerCloseNote(row.managerNote ?? "");
  }, [liquidationDate, myLiquidationReviewQuery.data]);

  const creditForm = useForm<CreditFormValues>({
    resolver: zodResolver(creditSchema),
    defaultValues: {
      routeId: "",
      amount: 0,
      reference: ""
    },
    mode: "onChange"
  });

  const availableCreditRoutes = routesAllQuery.data?.data ?? [];

  const setDefaultRouteIdOnce = (): void => {
    if (creditForm.getValues("routeId")) return;
    const first = availableCreditRoutes[0];
    if (first) creditForm.setValue("routeId", first.id, { shouldDirty: false, shouldValidate: true });
  };

  if (isAdminView) {
    setDefaultRouteIdOnce();
  }

  const creditMutation = useMutation({
    mutationFn: async (values: CreditFormValues): Promise<{ data: { routeId: string; updatedBalance: number; creditedAmount: number } }> => {
      const reference = values.reference && values.reference.trim().length > 0 ? values.reference : undefined;
      const response = await api.post("/treasury/credit", {
        routeId: values.routeId,
        amount: values.amount,
        reference
      });
      return response.data as { data: { routeId: string; updatedBalance: number; creditedAmount: number } };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["routes-treasury"] }),
        queryClient.invalidateQueries({ queryKey: ["routes-treasury-all"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-review-me"] })
      ]);
    }
  });

  const submitLiquidationReviewMutation = useMutation({
    mutationFn: async (): Promise<{ data: LiquidationReviewRow }> => {
      const note = managerCloseNote.trim();
      const response = await api.post<{ data: LiquidationReviewRow }>("/treasury/liquidation-reviews/submit", {
        date: liquidationDate,
        managerNote: note.length > 0 ? note : undefined
      });
      return response.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-review-me"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] })
      ]);
    }
  });

  const approveLiquidationReviewMutation = useMutation({
    mutationFn: async (managerId: string): Promise<void> => {
      await api.post(`/treasury/liquidation-reviews/${managerId}/approve`, { date: liquidationDate });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] });
    }
  });

  const rejectLiquidationReviewMutation = useMutation({
    mutationFn: async (payload: { managerId: string; reason: string }): Promise<void> => {
      await api.post(`/treasury/liquidation-reviews/${payload.managerId}/reject`, {
        date: liquidationDate,
        reason: payload.reason
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] });
    }
  });

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Tesorería</h1>
            <p className="mt-1 text-sm text-textSecondary">
              {isRouteManagerView
                ? "Liquidación, cierre diario y envío a revisión de administración."
                : "Saldo de ruta, crédito, liquidación y aprobación de cierres."}
            </p>
          </div>
          <p className="text-sm text-textSecondary">
            Rol: <span className="text-textPrimary">{role}</span>
          </p>
        </div>
      </header>

      {isAdminView || isRouteManagerView ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="mb-1 block text-sm text-textSecondary">Día operativo (Bogotá)</label>
          <input
            type="date"
            className="w-full max-w-xs rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
            value={liquidationDate}
            onChange={(e) => {
              setLiquidationDate(e.target.value);
              setReviewPage(1);
            }}
          />
          <p className="mt-2 text-xs text-textSecondary">
            Esta fecha aplica al detalle de liquidación y al cierre para aprobación.
          </p>
        </div>
      ) : null}

      {isAdminView ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Cierres del día (todos los encargados)</h2>
          <p className="mt-1 text-sm text-textSecondary">
            Recaudo y prestado del día seleccionado. El neto del día es recaudo menos capital prestado ese día. El disponible para prestar
            suma por cada ruta el máximo entre cero y (caja en ruta menos capital activo colocado en préstamos): es el cupo operativo según
            tesorería y cartera, no solo el movimiento del día.
          </p>
          {liquidationReviewsListQuery.isLoading ? (
            <p className="mt-4 text-sm text-textSecondary">Cargando cierres...</p>
          ) : null}
          {liquidationReviewsListQuery.isError ? (
            <p className="mt-4 text-sm text-danger">{getErrorMessage(liquidationReviewsListQuery.error)}</p>
          ) : null}
          {liquidationReviewsListQuery.data ? (
            <div className="mt-4">
              <div className="rutapay-table-wrap">
                {liquidationReviewsListQuery.data.total === 0 ? (
                  <p className="text-sm text-textSecondary">No hay encargados con rutas asignadas.</p>
                ) : (
                  <table className="rutapay-table">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Encargado
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Recaudo día
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Prestado día
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Neto día
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Caja rutas
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Disp. prestar
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Estado
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {liquidationReviewsListQuery.data.data.map((row) => (
                        <tr key={row.managerId} className="border-t border-border">
                          <td className="px-3 py-3 text-sm font-medium text-textPrimary">{row.managerName}</td>
                          <td className="px-3 py-3 text-right text-sm">{formatCOP(row.collectedOnDate)}</td>
                          <td className="px-3 py-3 text-right text-sm">{formatCOP(row.lentPrincipalOnDate)}</td>
                          <td className="px-3 py-3 text-right text-sm">{formatCOP(row.netCashflowDay)}</td>
                          <td className="px-3 py-3 text-right text-sm">{formatCOP(row.cashInRoutes)}</td>
                          <td className="px-3 py-3 text-right text-sm text-primary">{formatCOP(row.availableToLend)}</td>
                          <td className="px-3 py-3 text-sm text-textSecondary">
                            {liquidationReviewStatusLabel(row.reviewStatus)}
                          </td>
                          <td className="px-3 py-3 text-right text-sm">
                            {row.reviewStatus === "SUBMITTED" ? (
                              <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                                <button
                                  type="button"
                                  disabled={approveLiquidationReviewMutation.isPending}
                                  className="rounded-md border border-success px-3 py-1 text-xs text-success hover:bg-success/10 disabled:opacity-50"
                                  onClick={() => approveLiquidationReviewMutation.mutate(row.managerId)}
                                >
                                  Aprobar
                                </button>
                                <button
                                  type="button"
                                  disabled={rejectLiquidationReviewMutation.isPending}
                                  className="rounded-md border border-danger px-3 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                                  onClick={() => {
                                    const reason = window.prompt("Motivo del rechazo (obligatorio)");
                                    if (!reason || reason.trim().length < 3) return;
                                    rejectLiquidationReviewMutation.mutate({
                                      managerId: row.managerId,
                                      reason: reason.trim()
                                    });
                                  }}
                                >
                                  Rechazar
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-textSecondary">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {liquidationReviewsListQuery.data.total > 0 ? (
                <TablePagination
                  page={reviewPage}
                  limit={reviewLimit}
                  total={liquidationReviewsListQuery.data.total}
                  onPageChange={setReviewPage}
                  onLimitChange={(next) => {
                    setReviewLimit(next);
                    setReviewPage(1);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {isRouteManagerView && user?.id ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Liquidación del día</h2>
          <p className="mt-1 text-sm text-textSecondary">
            Resumen simple: lo recaudado, lo prestado y el saldo en caja. El crédito a la ruta lo gestiona administración.
          </p>
          {liquidationDetailQuery.isLoading ? (
            <p className="mt-4 text-sm text-textSecondary">Cargando liquidación...</p>
          ) : null}
          {liquidationDetailQuery.isError ? (
            <p className="mt-4 text-sm text-danger">{getErrorMessage(liquidationDetailQuery.error)}</p>
          ) : null}
          {liquidationDetailQuery.data?.data ? (
            <RouteManagerLiquidationSimple data={liquidationDetailQuery.data.data} />
          ) : null}

          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-base font-semibold text-textPrimary">Cierre del día para administración</h3>
            <p className="mt-1 text-sm text-textSecondary">
              Usa los mismos importes del resumen de arriba. Envía a revisión cuando cuadre; un administrador aprobará o rechazará.
            </p>
            {myLiquidationReviewQuery.isLoading ? (
              <p className="mt-4 text-sm text-textSecondary">Cargando resumen...</p>
            ) : null}
            {myLiquidationReviewQuery.isError ? (
              <p className="mt-4 text-sm text-danger">{getErrorMessage(myLiquidationReviewQuery.error)}</p>
            ) : null}
            {myLiquidationReviewQuery.data?.data ? (
              <div className="mt-4 space-y-3 rounded-lg border border-border bg-bg p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-textSecondary">Estado</span>
                  <span className="font-medium text-textPrimary">
                    {liquidationReviewStatusLabel(myLiquidationReviewQuery.data.data.reviewStatus)}
                  </span>
                </div>
                {myLiquidationReviewQuery.data.data.reviewNote ? (
                  <p className="text-xs text-textSecondary">
                    Nota de revisión: {myLiquidationReviewQuery.data.data.reviewNote}
                  </p>
                ) : null}
                <label className="mt-2 block text-sm text-textSecondary">Nota para administración (opcional)</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary"
                  rows={2}
                  value={managerCloseNote}
                  onChange={(e) => setManagerCloseNote(e.target.value)}
                  disabled={
                    submitLiquidationReviewMutation.isPending ||
                    myLiquidationReviewQuery.data.data.reviewStatus === "APPROVED"
                  }
                />
                <button
                  type="button"
                  disabled={
                    submitLiquidationReviewMutation.isPending ||
                    myLiquidationReviewQuery.data.data.reviewStatus === "APPROVED"
                  }
                  className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => submitLiquidationReviewMutation.mutate()}
                >
                  {submitLiquidationReviewMutation.isPending
                    ? myLiquidationReviewQuery.data.data.reviewStatus === "SUBMITTED"
                      ? "Guardando..."
                      : "Enviando..."
                    : myLiquidationReviewQuery.data.data.reviewStatus === "SUBMITTED"
                      ? "Actualizar nota del envío"
                      : "Enviar a revisión"}
                </button>
                {myLiquidationReviewQuery.data.data.reviewStatus === "SUBMITTED" ? (
                  <p className="text-xs text-textSecondary">
                    En revisión: puedes actualizar la nota hasta que administración apruebe o rechace.
                  </p>
                ) : null}
                {myLiquidationReviewQuery.data.data.reviewStatus === "REJECTED" ? (
                  <p className="text-xs text-warning">
                    Rechazado: corrige lo indicado en la nota y vuelve a enviar.
                  </p>
                ) : null}
                {submitLiquidationReviewMutation.isError ? (
                  <p className="text-sm text-danger">{getErrorMessage(submitLiquidationReviewMutation.error)}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAdminView ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-6 xl:col-span-2">
              <h2 className="text-lg font-semibold">Saldo por ruta</h2>
              {routesTableQuery.isLoading ? <p className="mt-2 text-sm text-textSecondary">Cargando rutas...</p> : null}
              {routesTableQuery.isError ? (
                <p className="mt-2 text-sm text-danger">{getErrorMessage(routesTableQuery.error)}</p>
              ) : null}
              {routesTableQuery.data ? (
                <div className="mt-4">
                  <div className="rutapay-table-wrap">
                  {routesTableQuery.data.total === 0 ? (
                    <p className="text-sm text-textSecondary">No hay rutas registradas.</p>
                  ) : (
                    <table className="rutapay-table">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Ruta
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Encargado
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {routesTableQuery.data.data.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="px-3 py-3 text-sm">
                              <span className="font-medium">{r.name}</span>
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">
                              {r.managerName || managerNameById[r.managerId] || r.managerId}
                            </td>
                            <td className="px-3 py-3 text-right text-sm text-textPrimary">
                              {formatCOP(r.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  </div>
                  {routesTableQuery.data.total > 0 ? (
                    <TablePagination
                      page={routesPage}
                      limit={routesLimit}
                      total={routesTableQuery.data.total}
                      onPageChange={setRoutesPage}
                      onLimitChange={(next) => {
                        setRoutesLimit(next);
                        setRoutesPage(1);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Crédito a ruta</h2>
              <form
                className="mt-4 space-y-3"
                onSubmit={creditForm.handleSubmit(async (values) => {
                  await creditMutation.mutateAsync(values);
                })}
              >
                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Ruta</label>
                  <select
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    value={creditForm.watch("routeId")}
                    onChange={(e) => creditForm.setValue("routeId", e.target.value, { shouldValidate: true })}
                  >
                    {availableCreditRoutes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {creditForm.formState.errors.routeId ? (
                    <p className="mt-1 text-xs text-danger">{creditForm.formState.errors.routeId.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Monto (COP)</label>
                  <input
                    type="number"
                    step={1}
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...creditForm.register("amount", { valueAsNumber: true })}
                  />
                  {creditForm.formState.errors.amount ? (
                    <p className="mt-1 text-xs text-danger">{creditForm.formState.errors.amount.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Referencia (opcional)</label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...creditForm.register("reference")}
                  />
                  {creditForm.formState.errors.reference ? (
                    <p className="mt-1 text-xs text-danger">{creditForm.formState.errors.reference.message}</p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={creditMutation.isPending || !creditForm.formState.isValid || availableCreditRoutes.length === 0}
                  className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  {creditMutation.isPending ? "Procesando..." : "Aplicar crédito"}
                </button>
              </form>

              {creditMutation.isError ? (
                <p className="mt-3 text-sm text-danger">{getErrorMessage(creditMutation.error)}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Liquidación por encargado</h2>
            <p className="mt-1 text-sm text-textSecondary">
              Vista por encargado, desglosada por cada ruta asignada y por frecuencia de cuota del préstamo.
            </p>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="lg:flex-1">
                <label className="mb-1 block text-sm text-textSecondary">Encargado</label>
                <select
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                >
                  <option value="">Selecciona un encargado</option>
                  {managerIds.map((id) => (
                    <option key={id} value={id}>
                      {managerNameById[id] ?? id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedManagerId ? (
              liquidationDetailQuery.isLoading ? (
                <p className="mt-4 text-sm text-textSecondary">Calculando liquidación...</p>
              ) : liquidationDetailQuery.isError ? (
                <p className="mt-4 text-sm text-danger">{getErrorMessage(liquidationDetailQuery.error)}</p>
              ) : liquidationDetailQuery.data?.data ? (
                <LiquidationDashboard data={liquidationDetailQuery.data.data} />
              ) : null
            ) : (
              <p className="mt-4 text-sm text-textSecondary">Selecciona un encargado para ver la liquidación.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default TreasuryPage;
