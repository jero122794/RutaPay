// frontend/app/(dashboard)/treasury/page.tsx
"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";
import TablePagination from "../../../components/ui/TablePagination";
import { getBogotaYMD, toBogotaDayKey } from "../../../lib/bogota";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
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

interface PaymentItem {
  id: string;
  clientName: string;
  amount: number;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  createdAt: string;
}

interface LoanMovementItem {
  id: string;
  principal: number;
  startDate: string;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  clientId: string;
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

const formatBogotaTimeFromIso = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
};

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
          <table className="rutapay-table rutapay-table--responsive">
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
                  <td data-label="Ruta" className="px-3 py-3 text-sm font-medium text-textPrimary">{r.routeName}</td>
                  <td data-label="Caja" className="px-3 py-3 text-right text-sm">{formatCOP(r.cashInRoute)}</td>
                  <td data-label="Cartera activa" className="px-3 py-3 text-right text-sm">{formatCOP(r.activePortfolio)}</td>
                  <td data-label="Recaudo día" className="px-3 py-3 text-right text-sm">{formatCOP(r.collectedOnDate)}</td>
                  <td data-label="Prestado día" className="px-3 py-3 text-right text-sm">{formatCOP(r.lentPrincipalOnDate)}</td>
                  <td data-label="Mora" className="px-3 py-3 text-right text-sm text-warning">
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
          <table className="rutapay-table rutapay-table--responsive">
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
                  <td data-label="Frecuencia" className="px-3 py-3 text-sm text-textPrimary">{row.label}</td>
                  <td data-label="Recaudo día" className="px-3 py-3 text-right text-sm">{formatCOP(row.collectedOnDate)}</td>
                  <td data-label="Prestado día" className="px-3 py-3 text-right text-sm">{formatCOP(row.lentPrincipalOnDate)}</td>
                  <td data-label="Préstamos activos" className="px-3 py-3 text-right text-sm">{row.activeLoansCount}</td>
                  <td data-label="Mora" className="px-3 py-3 text-right text-sm text-warning">
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
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
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
  const [search, setSearch] = useState("");

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

  const paymentsWideQuery = useQuery({
    queryKey: ["treasury-movements-payments", liquidationDate],
    queryFn: async (): Promise<ListResponse<PaymentItem>> => {
      const response = await api.get<ListResponse<PaymentItem>>("/payments", {
        params: { page: 1, limit: 2000 }
      });
      return response.data;
    },
    enabled: isRouteManagerView
  });

  const loansWideQuery = useQuery({
    queryKey: ["treasury-movements-loans", liquidationDate],
    queryFn: async (): Promise<ListResponse<LoanMovementItem>> => {
      const response = await api.get<ListResponse<LoanMovementItem>>("/loans", {
        params: { page: 1, limit: 2000 }
      });
      return response.data;
    },
    enabled: isRouteManagerView
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

  const movements = useMemo(() => {
    if (!isRouteManagerView) return [];

    const paymentRows = (paymentsWideQuery.data?.data ?? [])
      .filter((p) => p.status === "ACTIVE")
      .filter((p) => toBogotaDayKey(p.createdAt) === liquidationDate)
      .map((p) => ({
        kind: "PAYMENT" as const,
        id: p.id,
        title: "Colección",
        subtitle: `Cliente: ${p.clientName} · ${formatBogotaTimeFromIso(p.createdAt)}`,
        amount: p.amount,
        signedAmount: p.amount,
        tone: "positive" as const,
        at: p.createdAt
      }));

    const loanRows = (loansWideQuery.data?.data ?? [])
      .filter((l) => l.status === "ACTIVE")
      .filter((l) => toBogotaDayKey(l.startDate) === liquidationDate)
      .map((l) => ({
        kind: "LOAN" as const,
        id: l.id,
        title: "Nuevo préstamo",
        subtitle: `ID: ${l.id.slice(0, 8).toUpperCase()} · ${formatBogotaTimeFromIso(l.startDate)}`,
        amount: l.principal,
        signedAmount: -l.principal,
        tone: "negative" as const,
        at: l.startDate
      }));

    const q = search.trim().toLowerCase();
    const merged = [...paymentRows, ...loanRows].sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      return tb - ta;
    });

    const filtered = q.length
      ? merged.filter((m) => `${m.title} ${m.subtitle} ${m.id}`.toLowerCase().includes(q))
      : merged;

    return filtered.slice(0, 12);
  }, [isRouteManagerView, liquidationDate, loansWideQuery.data, paymentsWideQuery.data, search]);

  const rmLiquidation = liquidationDetailQuery.data?.data ?? null;
  const rmReview = myLiquidationReviewQuery.data?.data ?? null;
  const rmCanSubmit =
    Boolean(rmLiquidation) &&
    rmReview?.reviewStatus !== "APPROVED" &&
    !submitLiquidationReviewMutation.isPending;

  const closeTaskDataReady = Boolean(rmLiquidation);
  const closeTaskNoteReady = managerCloseNote.trim().length > 0;
  const closeTaskSubmitted = rmReview?.reviewStatus === "SUBMITTED" || rmReview?.reviewStatus === "APPROVED";
  const closeAllTasksDone = closeTaskDataReady && closeTaskNoteReady && closeTaskSubmitted;

  const rmFrequencyBars = useMemo(() => {
    const rows = rmLiquidation?.byFrequency ?? [];
    const top = [...rows]
      .sort((a, b) => b.collectedOnDate - a.collectedOnDate)
      .slice(0, 5);
    const max = Math.max(1, ...top.map((r) => r.collectedOnDate));
    return top.map((r) => ({
      key: r.frequency,
      label: r.label,
      value: r.collectedOnDate,
      pct: Math.round((r.collectedOnDate / max) * 100)
    }));
  }, [rmLiquidation]);

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
            {isRouteManagerView
              ? "Esta fecha aplica a tu liquidación del día y al cierre que envías a revisión."
              : "Esta fecha aplica al detalle de liquidación y al cierre para aprobación."}
          </p>
        </div>
      ) : null}

      {isRouteManagerView && user?.id ? (
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-outline-variant/10 bg-surface-container-high p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="headline text-xl font-extrabold tracking-tight">Ruut · Tesorería</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Movimientos y cierre del día operativo ({liquidationDate}).
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-outline-variant/10 bg-surface-container-lowest/50 px-4 py-2">
                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
                  search
                </span>
                <input
                  className="w-72 border-none bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0"
                  placeholder="Buscar movimientos…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {liquidationDetailQuery.isLoading ? (
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
              <p className="text-sm text-on-surface-variant">Cargando liquidación…</p>
            </div>
          ) : null}
          {liquidationDetailQuery.isError ? (
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
              <p className="text-sm text-error">{getErrorMessage(liquidationDetailQuery.error)}</p>
            </div>
          ) : null}

          {rmLiquidation ? (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-primary-container p-8 shadow-[0_12px_32px_rgba(0,0,0,0.35),0_4px_8px_rgba(105,246,184,0.08)] md:col-span-6 lg:col-span-5">
                  <div className="relative z-10">
                    <p className="mb-1 text-sm font-medium text-on-primary/70">Saldo en caja</p>
                    <div className="flex items-end gap-3">
                      <h3 className="headline text-5xl font-extrabold tracking-tight text-on-primary">
                        {formatCOP(rmLiquidation.currentBalance)}
                      </h3>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-on-primary/10 px-3 py-1 text-xs font-bold text-on-primary backdrop-blur-sm">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden>
                        account_balance_wallet
                      </span>
                      Caja actual de tu ruta
                    </div>
                  </div>
                  <div className="pointer-events-none absolute -bottom-12 -right-12 opacity-10">
                    <span className="material-symbols-outlined text-[180px]" aria-hidden>
                      account_balance_wallet
                    </span>
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-[2rem] border border-outline-variant/5 bg-surface-container-high p-6 md:col-span-6 lg:col-span-3">
                  <div>
                    <p className="mb-1 text-sm text-on-surface-variant">Cobros del día</p>
                    <p className="headline text-3xl font-bold tracking-tight text-primary">
                      {formatCOP(rmLiquidation.totalsOnDate.collected)}
                    </p>
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Net cashflow</span>
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-container-lowest">
                        <div className="h-full w-[100%] rounded-full bg-primary/60" />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-on-surface-variant">
                      {formatCOP(rmLiquidation.totalsOnDate.collected - rmLiquidation.totalsOnDate.lentPrincipal)}
                    </span>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-[2rem] border border-outline-variant/5 bg-surface-container-high p-6 md:col-span-12 lg:col-span-4">
                  <div>
                    <p className="mb-1 text-sm text-on-surface-variant">Egresos / préstamos</p>
                    <p className="headline text-3xl font-bold tracking-tight text-error">
                      {formatCOP(rmLiquidation.totalsOnDate.lentPrincipal)}
                    </p>
                  </div>
                  <div className="mt-6 flex gap-4 overflow-x-auto">
                    <div className="w-28 flex-shrink-0 rounded-2xl border border-outline-variant/5 bg-surface-container-low p-3">
                      <span className="mb-1 block text-[10px] uppercase tracking-widest text-on-surface-variant">Cartera</span>
                      <span className="text-sm font-bold text-on-surface">{formatCOP(rmLiquidation.activePortfolio)}</span>
                    </div>
                    <div className="w-28 flex-shrink-0 rounded-2xl border border-outline-variant/5 bg-surface-container-low p-3">
                      <span className="mb-1 block text-[10px] uppercase tracking-widest text-on-surface-variant">A devolver</span>
                      <span className="text-sm font-bold text-on-surface">{formatCOP(rmLiquidation.amountToReturn)}</span>
                    </div>
                    <div className="w-28 flex-shrink-0 rounded-2xl border border-outline-variant/5 bg-surface-container-low p-3">
                      <span className="mb-1 block text-[10px] uppercase tracking-widest text-on-surface-variant">Recaudo hist.</span>
                      <span className="text-sm font-bold text-on-surface">{formatCOP(rmLiquidation.recoveredPayments)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <h4 className="headline flex items-center gap-2 text-xl font-extrabold">
                      Movimientos de hoy
                      <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-primary">
                        Live
                      </span>
                    </h4>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-outline-variant/5 bg-surface-container-high px-4 py-2 text-xs font-bold text-on-surface-variant"
                        onClick={() => setSearch("")}
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  {paymentsWideQuery.isLoading || loansWideQuery.isLoading ? (
                    <p className="text-sm text-on-surface-variant">Cargando movimientos…</p>
                  ) : null}
                  {paymentsWideQuery.isError ? (
                    <p className="text-sm text-error">{getErrorMessage(paymentsWideQuery.error)}</p>
                  ) : null}
                  {loansWideQuery.isError ? <p className="text-sm text-error">{getErrorMessage(loansWideQuery.error)}</p> : null}

                  {movements.length === 0 ? (
                    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
                      <p className="text-sm text-on-surface-variant">No hay movimientos para la fecha seleccionada.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {movements.map((m) => (
                        <div
                          key={`${m.kind}-${m.id}`}
                          className="group flex items-center justify-between rounded-2xl bg-surface-container-low p-4 transition-colors hover:bg-surface-container-high"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={[
                                "flex h-12 w-12 items-center justify-center rounded-xl",
                                m.tone === "positive" ? "bg-primary/10 text-primary" : "bg-error/10 text-error"
                              ].join(" ")}
                            >
                              <span className="material-symbols-outlined" aria-hidden>
                                {m.kind === "PAYMENT" ? "payments" : "send_money"}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-on-surface">{m.title}</p>
                              <p className="text-xs text-on-surface-variant">{m.subtitle}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={[
                                "text-sm font-bold",
                                m.tone === "positive" ? "text-primary" : "text-error"
                              ].join(" ")}
                            >
                              {m.signedAmount >= 0 ? "+" : "-"}
                              {formatCOP(Math.abs(m.signedAmount))}
                            </p>
                            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                              {m.kind === "PAYMENT" ? "Cobro" : "Préstamo"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="rounded-[2rem] border border-outline-variant/5 bg-surface-container-high p-8">
                    <h4 className="headline mb-6 text-lg font-bold">Estadísticas de eficiencia</h4>
                    {rmFrequencyBars.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">Sin datos por frecuencia para este día.</p>
                    ) : (
                      <div className="space-y-4">
                        {rmFrequencyBars.map((b) => (
                          <div key={b.key} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-on-surface-variant">{b.label}</span>
                              <span className="font-bold text-on-surface">{formatCOP(b.value)}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-surface-container-lowest">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${b.pct}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[2rem] border border-outline-variant/5 bg-surface-container-high p-8">
                    <div className="mb-6 flex items-center gap-3">
                      <span className="material-symbols-outlined text-tertiary" aria-hidden>
                        task_alt
                      </span>
                      <h4 className="headline text-lg font-bold">Tareas de cierre</h4>
                    </div>

                    <div className="mb-8 space-y-3">
                      <div
                        className={[
                          "flex items-center gap-3 rounded-xl p-3",
                          closeTaskDataReady
                            ? "border border-primary/20 bg-surface-container-low"
                            : "border border-outline-variant/10 bg-surface-container-low opacity-60"
                        ].join(" ")}
                      >
                        <span
                          className="material-symbols-outlined text-xl"
                          aria-hidden
                          style={{ fontVariationSettings: closeTaskDataReady ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          {closeTaskDataReady ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-sm font-medium text-on-surface">
                          Liquidación calculada
                        </span>
                      </div>

                      <div
                        className={[
                          "flex items-center gap-3 rounded-xl p-3",
                          closeTaskNoteReady
                            ? "border border-primary/20 bg-surface-container-low"
                            : "border border-outline-variant/10 bg-surface-container-low opacity-60"
                        ].join(" ")}
                      >
                        <span
                          className="material-symbols-outlined text-xl"
                          aria-hidden
                          style={{ fontVariationSettings: closeTaskNoteReady ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          {closeTaskNoteReady ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-sm font-medium text-on-surface">
                          Nota para administración
                        </span>
                      </div>

                      <div
                        className={[
                          "flex items-center gap-3 rounded-xl p-3",
                          closeTaskSubmitted
                            ? "border border-primary/20 bg-surface-container-low"
                            : "border border-outline-variant/10 bg-surface-container-low opacity-60"
                        ].join(" ")}
                      >
                        <span
                          className="material-symbols-outlined text-xl"
                          aria-hidden
                          style={{ fontVariationSettings: closeTaskSubmitted ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          {closeTaskSubmitted ? "check_circle" : "radio_button_unchecked"}
                        </span>
                        <span className="text-sm font-medium text-on-surface">Cierre enviado</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!rmCanSubmit || !closeTaskDataReady || !closeTaskNoteReady}
                      className={[
                        "flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all",
                        !rmCanSubmit || !closeTaskDataReady || !closeTaskNoteReady
                          ? "cursor-not-allowed bg-gradient-to-br from-primary/40 to-primary-container/40 text-on-primary/60"
                          : "bg-primary text-on-primary shadow-xl active:scale-[0.98]"
                      ].join(" ")}
                      onClick={() => submitLiquidationReviewMutation.mutate()}
                    >
                      <span className="material-symbols-outlined" aria-hidden>
                        send
                      </span>
                      {submitLiquidationReviewMutation.isPending
                        ? rmReview?.reviewStatus === "SUBMITTED"
                          ? "Guardando…"
                          : "Enviando…"
                        : rmReview?.reviewStatus === "SUBMITTED"
                          ? "Actualizar nota del envío"
                          : "Enviar liquidación diaria"}
                    </button>
                    <p className="mt-3 text-center text-[10px] uppercase tracking-wider text-on-surface-variant">
                      {closeAllTasksDone ? "Listo: enviado para revisión" : "Completa las tareas para habilitar"}
                    </p>

                    <div className="mt-6">
                      <label className="mb-2 block text-xs font-bold uppercase text-on-surface-variant">
                        Nota para administración
                      </label>
                      <textarea
                        className="w-full rounded-2xl border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface focus:ring-1 focus:ring-primary/40"
                        rows={3}
                        value={managerCloseNote}
                        onChange={(e) => setManagerCloseNote(e.target.value)}
                        disabled={rmReview?.reviewStatus === "APPROVED"}
                      />
                      {submitLiquidationReviewMutation.isError ? (
                        <p className="mt-2 text-sm text-error">{getErrorMessage(submitLiquidationReviewMutation.error)}</p>
                      ) : null}
                      {rmReview?.reviewStatus === "REJECTED" && rmReview.reviewNote ? (
                        <p className="mt-2 text-xs text-warning">Rechazado: {rmReview.reviewNote}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
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
                  <table className="rutapay-table rutapay-table--responsive">
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
                          <td data-label="Encargado" className="px-3 py-3 text-sm font-medium text-textPrimary">{row.managerName}</td>
                          <td data-label="Recaudo día" className="px-3 py-3 text-right text-sm">{formatCOP(row.collectedOnDate)}</td>
                          <td data-label="Prestado día" className="px-3 py-3 text-right text-sm">{formatCOP(row.lentPrincipalOnDate)}</td>
                          <td data-label="Neto día" className="px-3 py-3 text-right text-sm">{formatCOP(row.netCashflowDay)}</td>
                          <td data-label="Caja rutas" className="px-3 py-3 text-right text-sm">{formatCOP(row.cashInRoutes)}</td>
                          <td data-label="Disp. prestar" className="px-3 py-3 text-right text-sm text-primary">{formatCOP(row.availableToLend)}</td>
                          <td data-label="Estado" className="px-3 py-3 text-sm text-textSecondary">
                            {liquidationReviewStatusLabel(row.reviewStatus)}
                          </td>
                          <td data-no-label="true" data-align="end" className="px-3 py-3 text-right text-sm">
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
                    <table className="rutapay-table rutapay-table--responsive">
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
                            <td data-label="Ruta" className="px-3 py-3 text-sm">
                              <span className="font-medium">{r.name}</span>
                            </td>
                            <td data-label="Encargado" className="px-3 py-3 text-sm text-textSecondary">
                              {r.managerName || managerNameById[r.managerId] || r.managerId}
                            </td>
                            <td data-label="Balance" className="px-3 py-3 text-right text-sm text-textPrimary">
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
