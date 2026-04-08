// frontend/app/(dashboard)/treasury/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../lib/api";
import TablePagination from "../../../components/ui/TablePagination";
import { formatBogotaDate, getBogotaYMD, parseApiDateString, parseBogotaDateOnlyToUTC, toBogotaDayKey } from "../../../lib/bogota";
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

const formatYmdToEsCO = (ymd: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd.trim())) return ymd;
  try {
    return formatBogotaDate(parseBogotaDateOnlyToUTC(ymd.trim()));
  } catch {
    return ymd;
  }
};

const initialsFromManagerName = (name: string): string => {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase();
  return `${tokens[0]!.charAt(0)}${tokens[tokens.length - 1]!.charAt(0)}`.toUpperCase();
};

const adminLiquidationStatusBadge = (
  status: LiquidationReviewStatus
): { label: string; className: string } => {
  switch (status) {
    case "APPROVED":
      return { label: "Completado", className: "bg-primary/10 text-primary" };
    case "SUBMITTED":
      return { label: "Pendiente", className: "bg-tertiary/10 text-tertiary" };
    case "NOT_SUBMITTED":
      return { label: "No enviado", className: "bg-error/10 text-error" };
    case "REJECTED":
      return { label: "Rechazada", className: "bg-error/10 text-error" };
    default:
      return { label: status, className: "bg-surface-container-highest text-on-surface-variant" };
  }
};

const ROUTE_BALANCE_BORDER_ACCENTS: readonly string[] = [
  "border-l-primary",
  "border-l-tertiary",
  "border-l-outline",
  "border-l-error"
];

const RM_ROUTE_DOT_COLORS: readonly string[] = ["bg-primary", "bg-tertiary", "bg-primary", "bg-error"];

const rmCierreStatusPillClass = (status: LiquidationReviewStatus | undefined): string => {
  switch (status) {
    case "APPROVED":
      return "bg-primary/20 text-primary";
    case "SUBMITTED":
      return "bg-tertiary/20 text-tertiary";
    case "NOT_SUBMITTED":
      return "bg-error/20 text-error";
    case "REJECTED":
      return "bg-error/20 text-error";
    default:
      return "bg-surface-container-highest text-on-surface-variant";
  }
};

interface LiquidationDashboardProps {
  data: LiquidationResponse;
}

const formatBogotaTimeFromIso = (iso: string): string => {
  const d = parseApiDateString(iso);
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
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
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
    enabled: hasAuthHydrated && Boolean(user) && isAdminView
  });

  const routesAllQuery = useQuery({
    queryKey: ["routes-treasury-all"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && isAdminView
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
    enabled: hasAuthHydrated && Boolean(user) && isAdminView
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
      hasAuthHydrated &&
      Boolean(user) &&
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
    enabled: hasAuthHydrated && Boolean(user) && isAdminView
  });

  const liquidationReviewsStatsQuery = useQuery({
    queryKey: ["treasury-liquidation-reviews-stats", liquidationDate],
    queryFn: async (): Promise<LiquidationReviewsListResponse> => {
      const response = await api.get<LiquidationReviewsListResponse>("/treasury/liquidation-reviews", {
        params: { date: liquidationDate, page: 1, limit: 100 }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && isAdminView
  });

  const myLiquidationReviewQuery = useQuery({
    queryKey: ["treasury-liquidation-review-me", liquidationDate, user?.id ?? ""],
    queryFn: async (): Promise<{ data: LiquidationReviewRow }> => {
      const response = await api.get<{ data: LiquidationReviewRow }>("/treasury/liquidation-reviews/me", {
        params: { date: liquidationDate }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && isRouteManagerView && Boolean(user?.id)
  });

  const paymentsWideQuery = useQuery({
    queryKey: ["treasury-movements-payments", liquidationDate],
    queryFn: async (): Promise<ListResponse<PaymentItem>> => {
      const response = await api.get<ListResponse<PaymentItem>>("/payments");
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && isRouteManagerView
  });

  const loansWideQuery = useQuery({
    queryKey: ["treasury-movements-loans", liquidationDate],
    queryFn: async (): Promise<ListResponse<LoanMovementItem>> => {
      const response = await api.get<ListResponse<LoanMovementItem>>("/loans");
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && isRouteManagerView
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
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews-stats"] }),
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
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews-stats"] })
      ]);
    }
  });

  const approveLiquidationReviewMutation = useMutation({
    mutationFn: async (managerId: string): Promise<void> => {
      await api.post(`/treasury/liquidation-reviews/${managerId}/approve`, { date: liquidationDate });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews-stats"] })
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury-liquidation-reviews-stats"] })
      ]);
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

  const rmNetDay = useMemo((): number => {
    if (!rmLiquidation) return 0;
    return rmLiquidation.totalsOnDate.collected - rmLiquidation.totalsOnDate.lentPrincipal;
  }, [rmLiquidation]);

  const adminTreasuryStats = useMemo(() => {
    const rows = liquidationReviewsStatsQuery.data?.data ?? [];
    const totalRecaudo = rows.reduce((s, r) => s + r.collectedOnDate, 0);
    const totalDisponible = rows.reduce((s, r) => s + r.availableToLend, 0);
    const pendingClosures = rows.filter(
      (r) => r.reviewStatus === "NOT_SUBMITTED" || r.reviewStatus === "SUBMITTED"
    ).length;
    const sumNegativeNet = rows
      .filter((r) => r.netCashflowDay < 0)
      .reduce((s, r) => s + r.netCashflowDay, 0);
    const grandTotal = liquidationReviewsStatsQuery.data?.total ?? 0;
    return {
      totalRecaudo,
      totalDisponible,
      pendingClosures,
      sumNegativeNet,
      grandTotal,
      sampleSize: rows.length
    };
  }, [liquidationReviewsStatsQuery.data]);

  const adminNetAggregated = useMemo((): number => {
    const rows = liquidationReviewsStatsQuery.data?.data ?? [];
    return rows.reduce((s, r) => s + r.netCashflowDay, 0);
  }, [liquidationReviewsStatsQuery.data]);

  const adminTopRoutesByBalance = useMemo(() => {
    const rows = routesAllQuery.data?.data ?? [];
    return [...rows].sort((a, b) => b.balance - a.balance).slice(0, 4);
  }, [routesAllQuery.data]);

  const adminDateInputRef = useRef<HTMLInputElement>(null);
  const rmDateInputRef = useRef<HTMLInputElement>(null);
  const rmSearchInputRef = useRef<HTMLInputElement>(null);

  return (
    <section
      className={
        isAdminView
          ? "mx-auto max-w-7xl space-y-8 pb-28 md:pb-10"
          : isRouteManagerView
            ? "space-y-4 overflow-x-hidden pb-28 md:pb-8"
            : "space-y-4"
      }
    >
      {!isAdminView && !isRouteManagerView ? (
        <header className="rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold">Tesorería</h1>
              <p className="mt-1 text-sm text-textSecondary">
                Saldo de ruta, crédito, liquidación y aprobación de cierres.
              </p>
            </div>
            <p className="text-sm text-textSecondary">
              Rol: <span className="text-textPrimary">{role}</span>
            </p>
          </div>
        </header>
      ) : null}

      {isRouteManagerView && user?.id ? (
        <>
          <input
            ref={rmDateInputRef}
            type="date"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            value={liquidationDate}
            onChange={(e) => {
              setLiquidationDate(e.target.value);
              setReviewPage(1);
            }}
          />
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg bg-background px-1 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.35)] md:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-surface-container-highest text-xs font-bold text-primary">
                  {initialsFromManagerName(user.name ?? "?")}
                </div>
                <span className="font-headline text-xl font-black tracking-tight text-on-surface">Tesorería</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-2 text-on-surface-variant transition-opacity hover:opacity-80 active:scale-95"
                  aria-label="Buscar movimientos"
                  onClick={() => rmSearchInputRef.current?.focus()}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    search
                  </span>
                </button>
                <Link
                  href="/notifications"
                  className="relative rounded-lg p-2 text-on-surface-variant transition-opacity hover:opacity-80 active:scale-95"
                  aria-label="Alertas"
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    notifications
                  </span>
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-highest text-primary">
                  <span className="material-symbols-outlined" aria-hidden>
                    calendar_today
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">Fecha de operación</p>
                  <p className="font-headline text-sm font-bold text-on-surface">{formatYmdToEsCO(liquidationDate)}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg bg-surface-container-high p-2 text-primary/80 transition-colors hover:text-primary"
                aria-label="Cambiar fecha"
                onClick={() => {
                  const el = rmDateInputRef.current;
                  if (!el) return;
                  if (typeof el.showPicker === "function") {
                    void el.showPicker();
                  } else {
                    el.click();
                  }
                }}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  edit
                </span>
              </button>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative col-span-2 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-primary to-primary-container p-6 text-on-primary shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)]">
                    <div className="relative z-10">
                      <p className="mb-1 text-sm font-semibold text-on-primary/80">Recaudo total hoy</p>
                      <h2 className="font-headline text-3xl font-extrabold tracking-tight">
                        {formatCOP(rmLiquidation.totalsOnDate.collected)}
                      </h2>
                      <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-on-primary/20 bg-on-primary/10 px-3 py-1">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden>
                          trending_up
                        </span>
                        <span className="text-[11px] font-bold">Neto del día {formatCOP(rmNetDay)}</span>
                      </div>
                    </div>
                    <span
                      className="material-symbols-outlined pointer-events-none absolute -bottom-6 -right-6 text-9xl text-on-primary/10 opacity-30"
                      aria-hidden
                    >
                      account_balance
                    </span>
                  </div>
                  <div className="flex flex-col justify-between rounded-3xl bg-surface-container-high p-4">
                    <div>
                      <span className="material-symbols-outlined mb-2 text-primary" aria-hidden>
                        payments
                      </span>
                      <p className="text-[11px] font-medium text-on-surface-variant">Saldo en caja</p>
                    </div>
                    <p className="mt-2 font-headline text-lg font-bold text-primary">
                      {formatCOP(rmLiquidation.currentBalance)}
                    </p>
                  </div>
                  <div className="flex flex-col justify-between rounded-3xl bg-surface-container-high p-4">
                    <div>
                      <span className="material-symbols-outlined mb-2 text-error" aria-hidden>
                        analytics
                      </span>
                      <p className="text-[11px] font-medium text-on-surface-variant">Préstamos del día</p>
                    </div>
                    <p className="mt-2 font-headline text-lg font-bold text-error">
                      {formatCOP(rmLiquidation.totalsOnDate.lentPrincipal)}
                    </p>
                  </div>
                </div>

                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="font-headline text-lg font-bold text-on-surface">Tu cierre del día</h3>
                      <p className="text-xs text-on-surface-variant">Estado de liquidación</p>
                    </div>
                  </div>
                  {(() => {
                    const st = rmReview ? adminLiquidationStatusBadge(rmReview.reviewStatus) : null;
                    const borderTertiary = rmReview?.reviewStatus === "SUBMITTED";
                    const dim = rmReview?.reviewStatus === "NOT_SUBMITTED";
                    return (
                      <div
                        className={[
                          "space-y-3 rounded-2xl bg-surface-container-low p-4",
                          borderTertiary ? "border border-tertiary/20" : "",
                          dim ? "opacity-70" : ""
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-xs font-bold text-on-surface">
                              {initialsFromManagerName(user.name ?? "?")}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-on-surface">{user.name ?? "Encargado"}</p>
                              <p className="text-[10px] text-on-surface-variant">
                                ID: {user.id.slice(0, 8)} · {rmLiquidation.routeName}
                              </p>
                            </div>
                          </div>
                          {st ? (
                            <span
                              className={[
                                "rounded-md px-2 py-1 text-[10px] font-bold uppercase",
                                rmCierreStatusPillClass(rmReview?.reviewStatus)
                              ].join(" ")}
                            >
                              {st.label}
                            </span>
                          ) : (
                            <span className="rounded-md bg-surface-container-highest px-2 py-1 text-[10px] font-bold uppercase text-on-surface-variant">
                              —
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 border-t border-outline-variant/10 pt-2">
                          <div className="text-center">
                            <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Recaudo</p>
                            <p className="text-xs font-bold text-on-surface">
                              {formatCOP(rmLiquidation.totalsOnDate.collected)}
                            </p>
                          </div>
                          <div className="border-x border-outline-variant/10 text-center">
                            <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Préstamos</p>
                            <p className="text-xs font-bold text-on-surface">
                              {formatCOP(rmLiquidation.totalsOnDate.lentPrincipal)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Neto</p>
                            <p
                              className={[
                                "text-xs font-bold",
                                rmNetDay >= 0 ? "text-primary" : "text-error"
                              ].join(" ")}
                            >
                              {formatCOP(rmNetDay)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </section>

                <section className="space-y-4">
                  <h3 className="font-headline text-lg font-bold text-on-surface">Saldos por ruta</h3>
                  <div className="overflow-hidden rounded-3xl bg-surface-container-high p-1">
                    <div className="p-1">
                      {rmLiquidation.byRoute.length === 0 ? (
                        <p className="p-4 text-sm text-on-surface-variant">Sin rutas en el detalle.</p>
                      ) : (
                        rmLiquidation.byRoute.map((r, i) => {
                          const dot = RM_ROUTE_DOT_COLORS[i % RM_ROUTE_DOT_COLORS.length] ?? "bg-primary";
                          const neg = r.cashInRoute < 0;
                          return (
                            <div
                              key={r.routeId}
                              className="flex items-center justify-between rounded-2xl p-4 transition-colors hover:bg-surface-bright"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`h-2 w-2 rounded-full ${dot}`} />
                                <span className="text-sm font-medium text-on-surface">{r.routeName}</span>
                              </div>
                              <span
                                className={[
                                  "text-sm font-bold",
                                  neg ? "text-error" : i % 4 === 1 ? "text-tertiary" : "text-primary"
                                ].join(" ")}
                              >
                                {formatCOP(r.cashInRoute)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </section>

                <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-high p-3 md:rounded-full md:bg-surface-container-lowest/50 md:px-4 md:py-2">
                  <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
                    search
                  </span>
                  <input
                    ref={rmSearchInputRef}
                    className="min-w-0 flex-1 border-none bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0"
                    placeholder="Buscar movimientos…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
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

                  <div
                    id="rm-enviar-cierre"
                    className="scroll-mt-28 rounded-[2rem] border border-outline-variant/5 bg-surface-container-high p-8"
                  >
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

          {rmLiquidation ? (
            <div className="pointer-events-none fixed bottom-24 right-4 z-40 md:bottom-8 md:right-6">
              <button
                type="button"
                className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-[0_8px_24px_rgba(105,246,184,0.4)] transition-transform active:scale-90"
                aria-label="Ir a enviar cierre"
                onClick={() =>
                  document.getElementById("rm-enviar-cierre")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <span className="material-symbols-outlined text-2xl" aria-hidden>
                  add_card
                </span>
                <span className="absolute right-16 hidden whitespace-nowrap rounded-lg border border-primary/20 bg-surface-bright px-3 py-1.5 text-[10px] font-bold text-primary shadow-xl sm:block">
                  Enviar cierre
                </span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {isAdminView ? (
        <div className="space-y-8">
          <input
            ref={adminDateInputRef}
            type="date"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            value={liquidationDate}
            onChange={(e) => {
              setLiquidationDate(e.target.value);
              setReviewPage(1);
            }}
          />

          {user ? (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-background px-1 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.35)] md:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-surface-container-highest text-xs font-bold text-primary">
                  {initialsFromManagerName(user.name ?? "?")}
                </div>
                <span className="font-headline text-xl font-black tracking-tight text-on-surface">Tesorería</span>
              </div>
              <Link
                href="/notifications"
                className="relative rounded-lg p-2 text-on-surface-variant transition-opacity hover:opacity-80 active:scale-95"
                aria-label="Alertas"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  notifications
                </span>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
              </Link>
            </div>
          ) : null}

          <div className="sticky top-0 z-30 -mx-4 hidden items-center justify-between border-b border-outline-variant/10 bg-background/80 px-4 py-4 backdrop-blur-xl sm:-mx-0 sm:rounded-xl sm:border sm:px-6 md:flex">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary" aria-hidden>
                account_balance
              </span>
              <div>
                <h1 className="font-headline text-lg font-bold text-on-surface">Tesorería central</h1>
                <p className="text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  Liquidación y cierre
                </p>
              </div>
            </div>
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-on-surface-variant transition-colors hover:text-on-surface"
              aria-label="Alertas"
            >
              <span className="material-symbols-outlined" aria-hidden>
                notifications
              </span>
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
            </Link>
          </div>

          <div className="space-y-6 md:hidden">
            <div className="flex items-center justify-between rounded-2xl bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-highest text-primary">
                  <span className="material-symbols-outlined" aria-hidden>
                    calendar_today
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">Fecha de operación</p>
                  <p className="font-headline text-sm font-bold text-on-surface">{formatYmdToEsCO(liquidationDate)}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg bg-surface-container-high p-2 text-primary/80 transition-colors hover:text-primary"
                aria-label="Cambiar fecha"
                onClick={() => {
                  const el = adminDateInputRef.current;
                  if (!el) return;
                  if (typeof el.showPicker === "function") {
                    void el.showPicker();
                  } else {
                    el.click();
                  }
                }}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  edit
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative col-span-2 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-primary to-primary-container p-6 text-on-primary shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)]">
                <div className="relative z-10">
                  <p className="mb-1 text-sm font-semibold text-on-primary/80">Recaudo total hoy</p>
                  <h2 className="font-headline text-3xl font-extrabold tracking-tight">
                    {liquidationReviewsStatsQuery.isLoading ? "—" : formatCOP(adminTreasuryStats.totalRecaudo)}
                  </h2>
                  <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-on-primary/20 bg-on-primary/10 px-3 py-1">
                    <span className="material-symbols-outlined text-[14px]" aria-hidden>
                      trending_up
                    </span>
                    <span className="text-[11px] font-bold">Neto agregado {formatCOP(adminNetAggregated)}</span>
                  </div>
                </div>
                <span
                  className="material-symbols-outlined pointer-events-none absolute -bottom-6 -right-6 text-9xl text-on-primary/10 opacity-30"
                  aria-hidden
                >
                  account_balance
                </span>
              </div>
              <div className="flex flex-col justify-between rounded-3xl bg-surface-container-high p-4">
                <div>
                  <span className="material-symbols-outlined mb-2 text-primary" aria-hidden>
                    payments
                  </span>
                  <p className="text-[11px] font-medium text-on-surface-variant">Disponible p/ crédito</p>
                </div>
                <p className="mt-2 font-headline text-lg font-bold text-primary">
                  {liquidationReviewsStatsQuery.isLoading ? "—" : formatCOP(adminTreasuryStats.totalDisponible)}
                </p>
              </div>
              <div className="flex flex-col justify-between rounded-3xl bg-surface-container-high p-4">
                <div>
                  <span className="material-symbols-outlined mb-2 text-error" aria-hidden>
                    analytics
                  </span>
                  <p className="text-[11px] font-medium text-on-surface-variant">Diferencia de cierre</p>
                </div>
                <p
                  className={[
                    "mt-2 font-headline text-lg font-bold",
                    adminTreasuryStats.sumNegativeNet < 0 ? "text-error" : "text-on-surface"
                  ].join(" ")}
                >
                  {liquidationReviewsStatsQuery.isLoading
                    ? "—"
                    : adminTreasuryStats.sumNegativeNet < 0
                      ? formatCOP(adminTreasuryStats.sumNegativeNet)
                      : formatCOP(0)}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden grid-cols-1 gap-6 md:grid md:grid-cols-12">
            <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6 md:col-span-4">
              <div className="mb-4 flex items-start justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Día operativo
                </label>
                <span className="material-symbols-outlined text-primary/90" aria-hidden>
                  calendar_today
                </span>
              </div>
              <h3 className="font-headline text-3xl font-extrabold text-primary">{formatYmdToEsCO(liquidationDate)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Contexto de <span className="text-tertiary">liquidación y cierre</span>. Las transacciones del día seleccionado se reflejan en
                estos totales y en la tabla de cierres.
              </p>
              <button
                type="button"
                className="mt-6 w-full rounded-lg border border-primary/10 bg-surface-container-highest py-2 text-xs font-bold text-primary transition-colors hover:bg-surface-bright"
                onClick={() => {
                  const el = adminDateInputRef.current;
                  if (!el) return;
                  if (typeof el.showPicker === "function") {
                    void el.showPicker();
                  } else {
                    el.click();
                  }
                }}
              >
                Cambiar fecha
              </button>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:col-span-8">
              <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-6">
                <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
                  <span className="material-symbols-outlined text-[120px] text-primary" aria-hidden>
                    payments
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">Recaudo total (día)</p>
                <p className="mt-1 font-headline text-2xl font-bold text-on-surface">
                  {liquidationReviewsStatsQuery.isLoading
                    ? "—"
                    : formatCOP(adminTreasuryStats.totalRecaudo)}
                </p>
                <p className="mt-2 text-[10px] text-on-surface-variant">
                  Suma por encargado (hasta {adminTreasuryStats.sampleSize} de {adminTreasuryStats.grandTotal})
                </p>
              </div>
              <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-6">
                <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
                  <span className="material-symbols-outlined text-[120px] text-tertiary" aria-hidden>
                    account_balance_wallet
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">Disponible p/ crédito</p>
                <p className="mt-1 font-headline text-2xl font-bold text-on-surface">
                  {liquidationReviewsStatsQuery.isLoading
                    ? "—"
                    : formatCOP(adminTreasuryStats.totalDisponible)}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-tertiary">
                  <span className="material-symbols-outlined text-xs" aria-hidden>
                    info
                  </span>
                  Cupo operativo agregado (misma muestra)
                </div>
              </div>
              <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-6">
                <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
                  <span className="material-symbols-outlined text-[120px] text-error" aria-hidden>
                    sync_problem
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">Atención cierres</p>
                <p
                  className={[
                    "mt-1 font-headline text-2xl font-bold",
                    adminTreasuryStats.sumNegativeNet < 0 ? "text-error" : "text-on-surface"
                  ].join(" ")}
                >
                  {liquidationReviewsStatsQuery.isLoading
                    ? "—"
                    : adminTreasuryStats.sumNegativeNet < 0
                      ? formatCOP(adminTreasuryStats.sumNegativeNet)
                      : formatCOP(0)}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-error">
                  <span className="material-symbols-outlined text-xs" aria-hidden>
                    error_outline
                  </span>
                  {adminTreasuryStats.pendingClosures} cierre(s) pendiente(s) o en revisión
                </div>
              </div>
            </section>
          </div>

          <section
            id="admin-cierres"
            className="scroll-mt-24 overflow-hidden rounded-2xl border border-outline-variant/5 bg-surface-container-low shadow-2xl"
          >
            <div className="flex flex-col gap-4 border-b border-outline-variant/10 bg-surface-container p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-headline text-lg font-bold text-on-surface">Cierres diarios (todos los encargados)</h3>
                <p className="text-xs text-on-surface-variant">Listado de liquidación para la fecha seleccionada</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary md:hidden"
                  onClick={() =>
                    document.getElementById("admin-cierres")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Ver todos
                </button>
                <button
                  type="button"
                  title="Próximamente"
                  className="rounded-lg bg-surface-container-highest p-2 text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    filter_list
                  </span>
                </button>
                <button
                  type="button"
                  title="Próximamente"
                  className="rounded-lg bg-surface-container-highest p-2 text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    download
                  </span>
                </button>
              </div>
            </div>
            {liquidationReviewsListQuery.isLoading ? (
              <p className="p-6 text-sm text-on-surface-variant">Cargando cierres…</p>
            ) : null}
            {liquidationReviewsListQuery.isError ? (
              <p className="p-6 text-sm text-error">{getErrorMessage(liquidationReviewsListQuery.error)}</p>
            ) : null}
            {liquidationReviewsListQuery.data && liquidationReviewsListQuery.data.total === 0 ? (
              <p className="p-6 text-sm text-on-surface-variant md:hidden">No hay encargados con rutas asignadas.</p>
            ) : null}
            {liquidationReviewsListQuery.data && liquidationReviewsListQuery.data.total > 0 ? (
              <div className="space-y-3 p-4 md:hidden">
                {liquidationReviewsListQuery.data.data.map((row) => {
                  const badge = adminLiquidationStatusBadge(row.reviewStatus);
                  const pill = rmCierreStatusPillClass(row.reviewStatus);
                  const borderTertiary = row.reviewStatus === "SUBMITTED";
                  const dim = row.reviewStatus === "NOT_SUBMITTED";
                  const netTone = row.netCashflowDay >= 0 ? "text-primary" : "text-error";
                  return (
                    <div
                      key={`m-${row.managerId}`}
                      className={[
                        "space-y-3 rounded-2xl bg-surface-container-low p-4",
                        borderTertiary ? "border border-tertiary/20" : "border border-outline-variant/10",
                        dim ? "opacity-70" : ""
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-xs font-bold text-on-surface">
                            {initialsFromManagerName(row.managerName)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-on-surface">{row.managerName}</p>
                            <p className="text-[10px] text-on-surface-variant">
                              ID: {row.managerId.slice(0, 8)} · Encargado
                            </p>
                          </div>
                        </div>
                        <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${pill}`}>{badge.label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-t border-outline-variant/10 pt-2">
                        <div className="text-center">
                          <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Recaudo</p>
                          <p className="text-xs font-bold text-on-surface">{formatCOP(row.collectedOnDate)}</p>
                        </div>
                        <div className="border-x border-outline-variant/10 text-center">
                          <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Préstamos</p>
                          <p className="text-xs font-bold text-on-surface">{formatCOP(row.lentPrincipalOnDate)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Neto</p>
                          <p className={`text-xs font-bold ${netTone}`}>{formatCOP(row.netCashflowDay)}</p>
                        </div>
                      </div>
                      {row.reviewStatus === "SUBMITTED" ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={approveLiquidationReviewMutation.isPending}
                            className="flex-1 rounded-lg border border-success py-2 text-xs font-semibold text-success hover:bg-success/10 disabled:opacity-50"
                            onClick={() => approveLiquidationReviewMutation.mutate(row.managerId)}
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            disabled={rejectLiquidationReviewMutation.isPending}
                            className="flex-1 rounded-lg border border-danger py-2 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
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
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {liquidationReviewsListQuery.data ? (
              <div id="admin-cierres-tabla" className="hidden overflow-x-auto md:block">
                {liquidationReviewsListQuery.data.total === 0 ? (
                  <p className="p-6 text-sm text-on-surface-variant">No hay encargados con rutas asignadas.</p>
                ) : (
                  <table className="w-full min-w-[880px] border-collapse text-left">
                    <thead className="bg-surface-container-lowest/50 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      <tr>
                        <th className="px-6 py-4">Encargado</th>
                        <th className="px-6 py-4 text-right">Recaudo día</th>
                        <th className="px-6 py-4 text-right">Préstamos</th>
                        <th className="px-6 py-4 text-right">Neto día</th>
                        <th className="px-6 py-4 text-right">Caja ruta</th>
                        <th className="px-6 py-4 text-right">Disp. préstamo</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {liquidationReviewsListQuery.data.data.map((row) => {
                        const badge = adminLiquidationStatusBadge(row.reviewStatus);
                        return (
                          <tr key={row.managerId} className="transition-colors hover:bg-surface-bright/40">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                  {initialsFromManagerName(row.managerName)}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-on-surface">{row.managerName}</p>
                                  <p className="text-[10px] text-on-surface-variant">Encargado de ruta</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-headline text-sm font-medium text-on-surface">
                              {formatCOP(row.collectedOnDate)}
                            </td>
                            <td className="px-6 py-4 font-headline text-sm font-medium text-tertiary">
                              {formatCOP(row.lentPrincipalOnDate)}
                            </td>
                            <td className="px-6 py-4 font-headline text-sm font-bold text-primary">
                              {formatCOP(row.netCashflowDay)}
                            </td>
                            <td className="px-6 py-4 font-headline text-sm text-on-surface">{formatCOP(row.cashInRoutes)}</td>
                            <td className="px-6 py-4 font-headline text-sm text-on-surface">
                              {formatCOP(row.availableToLend)}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={[
                                  "inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                                  badge.className
                                ].join(" ")}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {row.reviewStatus === "SUBMITTED" ? (
                                <div className="flex flex-col items-center justify-end gap-2 sm:flex-row sm:justify-center">
                                  <button
                                    type="button"
                                    disabled={approveLiquidationReviewMutation.isPending}
                                    className="rounded-lg border border-success px-3 py-1 text-xs font-semibold text-success hover:bg-success/10 disabled:opacity-50"
                                    onClick={() => approveLiquidationReviewMutation.mutate(row.managerId)}
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={rejectLiquidationReviewMutation.isPending}
                                    className="rounded-lg border border-danger px-3 py-1 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
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
                                <span className="text-on-surface-variant">
                                  <span className="material-symbols-outlined text-xl opacity-40" aria-hidden>
                                    visibility
                                  </span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
            {liquidationReviewsListQuery.data && liquidationReviewsListQuery.data.total > 0 ? (
              <div className="border-t border-outline-variant/10 bg-surface-container-lowest/30 px-4 py-4">
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
              </div>
            ) : null}
          </section>

          <section className="space-y-4 md:hidden">
            <h3 className="font-headline text-lg font-bold text-on-surface">Saldos por ruta</h3>
            <div className="overflow-hidden rounded-3xl bg-surface-container-high p-1">
              <div className="p-1">
                {routesAllQuery.isLoading ? (
                  <p className="p-4 text-sm text-on-surface-variant">Cargando…</p>
                ) : adminTopRoutesByBalance.length === 0 ? (
                  <p className="p-4 text-sm text-on-surface-variant">No hay rutas.</p>
                ) : (
                  adminTopRoutesByBalance.map((r, i) => {
                    const dot = RM_ROUTE_DOT_COLORS[i % RM_ROUTE_DOT_COLORS.length] ?? "bg-primary";
                    const neg = r.balance < 0;
                    return (
                      <div
                        key={`m-saldo-${r.id}`}
                        className="flex items-center justify-between rounded-2xl p-4 transition-colors hover:bg-surface-bright"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`h-2 w-2 rounded-full ${dot}`} />
                          <span className="text-sm font-medium text-on-surface">{r.name}</span>
                        </div>
                        <span
                          className={[
                            "text-sm font-bold",
                            neg ? "text-error" : i % 4 === 1 ? "text-tertiary" : "text-primary"
                          ].join(" ")}
                        >
                          {formatCOP(r.balance)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <section
              id="treasury-route-balances"
              className="hidden h-full flex-col rounded-xl border border-outline-variant/10 bg-surface-container-low p-6 md:col-span-4 md:flex"
            >
              <div className="mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  account_balance
                </span>
                <h3 className="text-sm font-bold uppercase tracking-tight text-on-surface">Saldos por ruta</h3>
              </div>
              {routesAllQuery.isLoading ? (
                <p className="text-sm text-on-surface-variant">Cargando…</p>
              ) : adminTopRoutesByBalance.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No hay rutas.</p>
              ) : (
                <div className="space-y-4">
                  {adminTopRoutesByBalance.map((r, i) => {
                    const accent = ROUTE_BALANCE_BORDER_ACCENTS[i % ROUTE_BALANCE_BORDER_ACCENTS.length] ?? "border-l-outline";
                    const negative = r.balance < 0;
                    return (
                      <div
                        key={r.id}
                        className={[
                          "flex items-center justify-between rounded-lg border border-outline-variant/10 bg-surface-container-high p-3 shadow-sm",
                          "border-l-4",
                          accent
                        ].join(" ")}
                      >
                        <span className="text-xs font-semibold text-on-surface">{r.name}</span>
                        <span
                          className={[
                            "font-headline text-sm font-bold",
                            negative ? "text-error" : i === 0 ? "text-primary" : "text-on-surface"
                          ].join(" ")}
                        >
                          {formatCOP(r.balance)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                className="mt-6 flex w-full items-center justify-center gap-2 text-xs text-on-surface-variant transition-colors hover:text-on-surface"
                onClick={() => document.getElementById("treasury-routes-table")?.scrollIntoView({ behavior: "smooth" })}
              >
                Ver desglose completo
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  arrow_forward
                </span>
              </button>
            </section>

            <section
              id="credito-ruta"
              className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6 md:col-span-5"
            >
              <div className="mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  add_card
                </span>
                <h3 className="text-sm font-bold uppercase tracking-tight text-on-surface">Crédito a ruta</h3>
              </div>
              <form
                className="space-y-4"
                onSubmit={creditForm.handleSubmit(async (values) => {
                  await creditMutation.mutateAsync(values);
                })}
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Seleccionar ruta</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-lg border border-outline-variant/20 bg-surface-container-lowest py-3 pl-4 pr-10 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                      value={creditForm.watch("routeId")}
                      onChange={(e) => creditForm.setValue("routeId", e.target.value, { shouldValidate: true })}
                    >
                      {availableCreditRoutes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.managerName ? ` (${r.managerName})` : ""}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-3 text-on-surface-variant material-symbols-outlined">
                      expand_more
                    </span>
                  </div>
                  {creditForm.formState.errors.routeId ? (
                    <p className="text-xs text-error">{creditForm.formState.errors.routeId.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Monto (COP)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 font-bold text-primary/80">$</span>
                    <input
                      type="number"
                      step={1}
                      className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest py-3 pl-8 pr-4 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                      placeholder="0"
                      {...creditForm.register("amount", { valueAsNumber: true })}
                    />
                  </div>
                  {creditForm.formState.errors.amount ? (
                    <p className="text-xs text-error">{creditForm.formState.errors.amount.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Referencia (opcional)</label>
                  <textarea
                    rows={2}
                    className="w-full resize-none rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                    placeholder="Nota del desembolso…"
                    {...creditForm.register("reference")}
                  />
                  {creditForm.formState.errors.reference ? (
                    <p className="text-xs text-error">{creditForm.formState.errors.reference.message}</p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={creditMutation.isPending || !creditForm.formState.isValid || availableCreditRoutes.length === 0}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-on-primary shadow-[0_8px_20px_rgba(105,246,184,0.15)] transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
                >
                  {creditMutation.isPending ? "Procesando…" : "Aplicar crédito"}
                </button>
              </form>
              {creditMutation.isError ? (
                <p className="mt-3 text-sm text-error">{getErrorMessage(creditMutation.error)}</p>
              ) : null}
            </section>

            <section className="flex flex-col justify-center rounded-xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-high to-surface-container-low p-6 text-center md:col-span-3">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl" aria-hidden style={{ fontVariationSettings: "'FILL' 1" }}>
                  summarize
                </span>
              </div>
              <h3 className="text-sm font-bold text-on-surface">Liquidaciones por encargado</h3>
              <p className="mb-6 mt-2 px-1 text-xs text-on-surface-variant">
                Consulta el detalle por ruta y frecuencia de cuotas para cada encargado.
              </p>
              <button
                type="button"
                className="w-full rounded-lg border border-primary/20 bg-surface-bright py-2 text-[10px] font-black uppercase tracking-widest text-primary transition-all hover:bg-primary hover:text-on-primary"
                onClick={() => document.getElementById("liquidacion-encargado")?.scrollIntoView({ behavior: "smooth" })}
              >
                Abrir detalle
              </button>
            </section>
          </div>

          <div id="treasury-routes-table" className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
            <h2 className="font-headline text-lg font-bold text-on-surface">Listado completo de rutas</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Paginación y saldos actualizados</p>
            {routesTableQuery.isLoading ? <p className="mt-4 text-sm text-on-surface-variant">Cargando rutas…</p> : null}
            {routesTableQuery.isError ? (
              <p className="mt-4 text-sm text-error">{getErrorMessage(routesTableQuery.error)}</p>
            ) : null}
            {routesTableQuery.data ? (
              <div className="mt-4">
                <div className="rutapay-table-wrap">
                  {routesTableQuery.data.total === 0 ? (
                    <p className="text-sm text-on-surface-variant">No hay rutas registradas.</p>
                  ) : (
                    <table className="rutapay-table rutapay-table--responsive">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Ruta
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Encargado
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {routesTableQuery.data.data.map((r) => (
                          <tr key={r.id} className="border-t border-outline-variant/10">
                            <td data-label="Ruta" className="px-3 py-3 text-sm">
                              <span className="font-medium text-on-surface">{r.name}</span>
                            </td>
                            <td data-label="Encargado" className="px-3 py-3 text-sm text-on-surface-variant">
                              {r.managerName || managerNameById[r.managerId] || r.managerId}
                            </td>
                            <td data-label="Balance" className="px-3 py-3 text-right text-sm text-on-surface">
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

          <div id="liquidacion-encargado" className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
            <h2 className="font-headline text-lg font-bold text-on-surface">Liquidación por encargado</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Vista por encargado, desglosada por cada ruta asignada y por frecuencia de cuota del préstamo.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-[10px] font-bold uppercase text-on-surface-variant">Encargado</label>
              <div className="relative max-w-xl">
                <select
                  className="w-full appearance-none rounded-lg border border-outline-variant/20 bg-surface-container-lowest py-3 pl-4 pr-10 text-sm text-on-surface outline-none focus:border-primary"
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
                <span className="pointer-events-none absolute right-3 top-3 text-on-surface-variant material-symbols-outlined">
                  expand_more
                </span>
              </div>
            </div>
            {selectedManagerId ? (
              liquidationDetailQuery.isLoading ? (
                <p className="mt-4 text-sm text-on-surface-variant">Calculando liquidación…</p>
              ) : liquidationDetailQuery.isError ? (
                <p className="mt-4 text-sm text-error">{getErrorMessage(liquidationDetailQuery.error)}</p>
              ) : liquidationDetailQuery.data?.data ? (
                <LiquidationDashboard data={liquidationDetailQuery.data.data} />
              ) : null
            ) : (
              <p className="mt-4 text-sm text-on-surface-variant">Selecciona un encargado para ver la liquidación.</p>
            )}
          </div>

          <div className="pointer-events-none fixed bottom-24 right-4 z-40 md:bottom-8 md:right-6">
            <button
              type="button"
              className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-[0_8px_24px_rgba(105,246,184,0.4)] transition-transform active:scale-90"
              aria-label="Aplicar crédito"
              onClick={() => document.getElementById("credito-ruta")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <span className="material-symbols-outlined text-2xl" aria-hidden>
                add_card
              </span>
              <span className="absolute right-16 hidden whitespace-nowrap rounded-lg border border-primary/20 bg-surface-bright px-3 py-1.5 text-[10px] font-bold text-primary shadow-xl sm:block">
                Aplicar crédito
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default TreasuryPage;
