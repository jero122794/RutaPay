// frontend/app/(dashboard)/overview/page.tsx
"use client";

import axios from "axios";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { useMemo, useState } from "react";
import api from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { formatCOP } from "../../../lib/formatters";
import { useAuthStore } from "../../../store/authStore";
import TablePagination from "../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import {
  getBogotaTodayKey,
  formatBogotaDateFromString,
  toBogotaDayKey,
  toBogotaDayKeyFromDate
} from "../../../lib/bogota";

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

interface RouteItem {
  id: string;
  name: string;
  managerId: string;
  balance: number;
}

interface LoanItem {
  id: string;
  routeId: string;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  totalAmount: number;
}

interface PaymentItem {
  id: string;
  amount: number;
  status?: "ACTIVE" | "REVERSED";
  createdAt: string;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface AuditLogItem {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
}

interface StatCardProps {
  title: string;
  value: string;
  hint: string;
  tone?: "default" | "cyan" | "emerald";
}

const StatCard = ({ title, value, hint, tone = "default" }: StatCardProps): JSX.Element => {
  const toneClass =
    tone === "cyan"
      ? "border-l-4 border-secondary"
      : tone === "emerald"
        ? "border-l-4 border-tertiary"
        : "border-l-4 border-emerald-400";

  return (
    <article className={`rounded-xl bg-surface-container-high p-6 shadow-xl ${toneClass}`}>
      <p className="font-manrope text-xs font-bold uppercase tracking-widest text-on-surface-variant">{title}</p>
      <p className="mt-3 font-headline text-3xl font-black tracking-tight text-on-surface md:text-4xl">{value}</p>
      <p className="mt-2 font-inter text-xs text-on-surface-variant">{hint}</p>
    </article>
  );
};

const OverviewPage = (): JSX.Element => {
  const [managerMetricsPage, setManagerMetricsPage] = useState(1);
  const [managerMetricsLimit, setManagerMetricsLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const user = useAuthStore((state) => state.user);
  const role = pickPrimaryRole(getEffectiveRoles(user));
  const isAdminView = role === "ADMIN" || role === "SUPER_ADMIN";
  const isRouteManagerView = role === "ROUTE_MANAGER";

  const routesQuery = useQuery({
    queryKey: ["routes-overview"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: hasAuthHydrated && isAdminView
  });

  const loansQuery = useQuery({
    queryKey: ["loans-overview"],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans");
      return response.data;
    },
    enabled: hasAuthHydrated && isAdminView
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments-overview"],
    queryFn: async (): Promise<ListResponse<PaymentItem>> => {
      const response = await api.get<ListResponse<PaymentItem>>("/payments");
      return response.data;
    },
    enabled: hasAuthHydrated && isAdminView
  });

  const auditLogsQuery = useQuery({
    queryKey: ["audit-logs", auditPage, auditLimit],
    queryFn: async (): Promise<ListResponse<AuditLogItem>> => {
      const response = await api.get<ListResponse<AuditLogItem>>("/audit-logs", {
        params: { page: auditPage, limit: auditLimit }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && isAdminView
  });

  type AdminScheduleRow = {
    installmentNumber: number;
    dueDate: string | Date;
    status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
    paidAmount?: number;
  };

  const adminActiveLoanIds = useMemo(() => {
    const list = loansQuery.data?.data ?? [];
    return list.filter((l) => l.status === "ACTIVE").map((l) => l.id);
  }, [loansQuery.data]);

  const adminScheduleQueries = useQueries({
    queries: adminActiveLoanIds.map((id) => ({
      queryKey: ["loan-schedule-admin-overview", id],
      queryFn: async (): Promise<{ data: AdminScheduleRow[] }> => {
        const response = await api.get<{ data: AdminScheduleRow[] }>(`/loans/${id}/schedule`);
        return response.data;
      },
      enabled: hasAuthHydrated && isAdminView && adminActiveLoanIds.length > 0
    }))
  });

  const todayKey = getBogotaTodayKey();

  const routeManagerClientsQuery = useQuery({
    queryKey: ["route-manager-clients"],
    queryFn: async (): Promise<ListResponse<RouteManagerClientItem>> => {
      const response = await api.get<ListResponse<RouteManagerClientItem>>("/clients");
      return response.data;
    },
    enabled: hasAuthHydrated && isRouteManagerView
  });

  const routeManagerRouteId = routeManagerClientsQuery.data?.data[0]?.routeId ?? "";

  const routeManagerLoansQuery = useQuery({
    queryKey: ["route-manager-loans"],
    queryFn: async (): Promise<ListResponse<RouteManagerLoanItem>> => {
      const response = await api.get<ListResponse<RouteManagerLoanItem>>("/loans");
      return response.data;
    },
    enabled: hasAuthHydrated && isRouteManagerView
  });

  const routeManagerPaymentsQuery = useQuery({
    queryKey: ["route-manager-payments"],
    queryFn: async (): Promise<ListResponse<RouteManagerPaymentItem>> => {
      const response = await api.get<ListResponse<RouteManagerPaymentItem>>("/payments");
      return response.data;
    },
    enabled: hasAuthHydrated && isRouteManagerView
  });

  const routeManagerTreasuryBalanceQuery = useQuery({
    queryKey: ["route-manager-treasury-balance", routeManagerRouteId],
    queryFn: async (): Promise<{ data: RouteBalanceResponse }> => {
      const response = await api.get<{ data: RouteBalanceResponse }>(
        `/treasury/balance/${routeManagerRouteId}`
      );
      return response.data;
    },
    enabled: hasAuthHydrated && isRouteManagerView && Boolean(routeManagerRouteId)
  });

  const activeLoansForManager =
    routeManagerLoansQuery.data?.data?.filter((loan) => loan.status === "ACTIVE") ?? [];

  const scheduleQueries = useQueries({
    queries: activeLoansForManager.map((loan) => ({
      queryKey: ["loan-schedule", loan.id],
      queryFn: async (): Promise<{ data: RouteManagerLoanScheduleItem[] }> => {
        const response = await api.get<{ data: RouteManagerLoanScheduleItem[] }>(`/loans/${loan.id}/schedule`);
        return response.data;
      },
      enabled: hasAuthHydrated && isRouteManagerView
    }))
  });

  const managerScheduleQueriesPending =
    activeLoansForManager.length > 0 && scheduleQueries.some((q) => q.isPending);

  type RouteManagerClientItem = {
    id: string;
    routeId: string;
  };

  type RouteManagerLoanItem = {
    id: string;
    status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
    startDate: string | Date;
  };

  type RouteManagerPaymentItem = {
    id: string;
    amount: number;
    createdAt: string | Date;
    method: "CASH" | "TRANSFER";
    status: "ACTIVE" | "REVERSED";
    clientName: string;
  };

  type RouteBalanceResponse = {
    routeId: string;
    currentBalance: number;
  };

  type RouteManagerLoanScheduleItem = {
    installmentNumber: number;
    dueDate: string | Date;
    status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
    paidAmount?: number;
  };

  const routeManagerScheduleItems = scheduleQueries.flatMap(
    (q) => (q.data?.data ?? []) as RouteManagerLoanScheduleItem[]
  );

  const routeManagerPayments = routeManagerPaymentsQuery.data?.data ?? [];
  const todayPaymentsForManager = useMemo(() => {
    if (!isRouteManagerView) return [];
    return routeManagerPayments
      .filter((p) => p.status === "ACTIVE")
      .filter((p) => {
        const created = typeof p.createdAt === "string" ? p.createdAt : p.createdAt.toISOString();
        return toBogotaDayKey(created) === todayKey;
      });
  }, [isRouteManagerView, routeManagerPayments, todayKey]);

  const hourKeyBogota = (value: string | Date): number => {
    const d = typeof value === "string" ? new Date(value) : value;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      hour12: false
    }).formatToParts(d);
    const h = parts.find((p) => p.type === "hour")?.value ?? "0";
    const n = Number(h);
    return Number.isFinite(n) ? n : 0;
  };

  const collectionsByHourForManager = useMemo(() => {
    if (!isRouteManagerView) return [];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const base: Array<{ hour: number; label: string; amount: number }> = hours.map((h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      amount: 0
    }));
    for (const p of todayPaymentsForManager) {
      const h = hourKeyBogota(p.createdAt);
      const row = base[h];
      if (!row) continue;
      row.amount += p.amount;
    }
    const hasAny = base.some((r) => r.amount > 0);
    if (!hasAny) {
      return base.slice(6, 20);
    }
    const first = Math.max(0, base.findIndex((r) => r.amount > 0) - 2);
    const lastIdx = base.length - 1 - [...base].reverse().findIndex((r) => r.amount > 0);
    const last = Math.min(base.length, lastIdx + 3);
    return base.slice(first, last);
  }, [isRouteManagerView, todayPaymentsForManager]);

  const methodDonutForManager = useMemo(() => {
    if (!isRouteManagerView) return { data: [] as Array<{ name: string; value: number; color: string }>, total: 0 };
    const cash = todayPaymentsForManager.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0);
    const transfer = todayPaymentsForManager.filter((p) => p.method === "TRANSFER").reduce((s, p) => s + p.amount, 0);
    const data = [
      { name: "Efectivo", value: cash, color: "#69f6b8" },
      { name: "Transferencia", value: transfer, color: "#699cff" }
    ].filter((x) => x.value > 0);
    const total = data.reduce((s, r) => s + r.value, 0);
    return { data, total };
  }, [isRouteManagerView, todayPaymentsForManager]);

  const recentPaymentsForManager = useMemo(() => {
    if (!isRouteManagerView) return [];
    return [...todayPaymentsForManager]
      .sort((a, b) => {
        const ad = typeof a.createdAt === "string" ? new Date(a.createdAt).getTime() : a.createdAt.getTime();
        const bd = typeof b.createdAt === "string" ? new Date(b.createdAt).getTime() : b.createdAt.getTime();
        return bd - ad;
      })
      .slice(0, 6);
  }, [isRouteManagerView, todayPaymentsForManager]);

  if (!hasAuthHydrated) {
    return (
      <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
        <h1 className="font-headline text-2xl font-bold text-on-surface">Panel de Control</h1>
        <p className="mt-2 text-sm text-textSecondary">Cargando panel...</p>
      </section>
    );
  }

  const dueTodayCount = routeManagerScheduleItems.filter((item) => {
    const dueKey =
      typeof item.dueDate === "string"
        ? toBogotaDayKey(item.dueDate)
        : toBogotaDayKeyFromDate(item.dueDate);
    return dueKey === todayKey && item.status !== "PAID";
  }).length;

  const overdueMoraCount = routeManagerScheduleItems.filter((item) => {
    if (item.status === "PAID") {
      return false;
    }
    const dueKey =
      typeof item.dueDate === "string"
        ? toBogotaDayKey(item.dueDate)
        : toBogotaDayKeyFromDate(item.dueDate);
    return dueKey < todayKey;
  }).length;

  const receivedTodayTotal =
    routeManagerPaymentsQuery.data?.data
      ?.filter((p) =>
        typeof p.createdAt === "string"
          ? toBogotaDayKey(p.createdAt) === todayKey
          : toBogotaDayKeyFromDate(p.createdAt) === todayKey
      )
      ?.reduce((acc, p) => acc + p.amount, 0) ?? 0;

  const prestamosActivosHoyCount = activeLoansForManager.filter((loan) => {
    const key = typeof loan.startDate === "string" ? toBogotaDayKey(loan.startDate) : toBogotaDayKeyFromDate(loan.startDate);
    return key === todayKey;
  }).length;
  const managerMetricsRows = [
    {
      id: "clients",
      label: "Mis clientes",
      value: String(routeManagerClientsQuery.data?.data?.length ?? 0)
    },
    { id: "active-loans", label: "Préstamos activos", value: String(activeLoansForManager.length) },
    { id: "active-loans-today", label: "Préstamos activos hoy", value: String(prestamosActivosHoyCount) }
  ];
  const pagedManagerMetricsRows = managerMetricsRows.slice(
    (managerMetricsPage - 1) * managerMetricsLimit,
    (managerMetricsPage - 1) * managerMetricsLimit + managerMetricsLimit
  );

  if (!isAdminView && !isRouteManagerView) {
    return (
      <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
        <h1 className="font-headline text-2xl font-bold text-on-surface">Panel de Control</h1>
        <p className="mt-2 text-sm text-textSecondary">
          Tu dashboard por rol se mostrará en el siguiente paso de la fase 3.
        </p>
      </section>
    );
  }

  if (isRouteManagerView) {
    const isLoading =
      routeManagerClientsQuery.isLoading ||
      routeManagerLoansQuery.isLoading ||
      routeManagerPaymentsQuery.isLoading ||
      managerScheduleQueriesPending;

    if (isLoading) {
      return (
        <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <p className="text-sm text-textSecondary">Cargando tu panel...</p>
        </section>
      );
    }

    const routeManagerFetchError =
      routeManagerClientsQuery.isError || routeManagerLoansQuery.isError || routeManagerPaymentsQuery.isError;
    if (routeManagerFetchError) {
      const msg = routeManagerClientsQuery.isError
        ? getErrorMessage(routeManagerClientsQuery.error)
        : routeManagerLoansQuery.isError
          ? getErrorMessage(routeManagerLoansQuery.error)
          : getErrorMessage(routeManagerPaymentsQuery.error);
      return (
        <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <h1 className="font-headline text-2xl font-bold text-on-surface">Panel de Control</h1>
          <p className="mt-2 text-sm text-danger">
            No se pudieron cargar los datos del panel. Si acabas de iniciar sesión, cierra sesión y vuelve a entrar.
            Detalle: {msg}
          </p>
        </section>
      );
    }

    const balance = routeManagerTreasuryBalanceQuery.data?.data.currentBalance ?? 0;

    return (
      <div className="space-y-8">
        <section>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Vista operativa</h1>
          <p className="mt-1 font-inter text-sm text-on-surface-variant">Resumen de tu ruta y cobros del día</p>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border-l-4 border-emerald-400 bg-surface-container-high p-6 shadow-xl">
            <div>
              <p className="font-manrope text-xs font-bold uppercase tracking-widest text-emerald-400/90">Saldo de ruta</p>
              <p className="mt-3 font-headline text-3xl font-black tracking-tight text-on-surface md:text-4xl">{formatCOP(balance)}</p>
            </div>
            <p className="mt-4 flex items-center gap-2 font-inter text-sm text-primary">
              <span className="material-symbols-outlined text-base" aria-hidden>
                trending_up
              </span>
              Disponible en tesorería
            </p>
          </article>
          <StatCard title="Cobros de hoy" value={formatCOP(receivedTodayTotal)} hint="Cobros exitosos registrados" tone="cyan" />
          <StatCard title="Cuotas pendientes" value={String(dueTodayCount)} hint="Programadas para hoy" tone="emerald" />
          <article className="flex flex-col justify-between rounded-xl border-l-4 border-tertiary bg-surface-container-high p-6 shadow-xl">
            <div>
              <p className="font-manrope text-xs font-bold uppercase tracking-widest text-tertiary">En mora</p>
              <p className="mt-3 font-headline text-3xl font-black tracking-tight text-on-surface md:text-4xl">
                {String(overdueMoraCount)}
              </p>
            </div>
            <p className="mt-4 flex items-center gap-2 font-inter text-sm text-tertiary">
              <span className="material-symbols-outlined text-base" aria-hidden>
                warning
              </span>
              Cuotas vencidas sin pagar
            </p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-6 shadow-2xl lg:col-span-2">
            <div className="mb-6 flex flex-col gap-1">
              <h2 className="font-headline text-xl font-extrabold text-on-surface">Recaudo de hoy</h2>
              <p className="text-sm text-on-surface-variant">Tendencia por hora (America/Bogotá).</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={collectionsByHourForManager} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rmCollectionsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(105,246,184,0.45)" />
                      <stop offset="100%" stopColor="rgba(105,246,184,0)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(64,72,93,0.25)" strokeDasharray="3 6" vertical={false} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(9,19,40,0.95)",
                      border: "1px solid rgba(64,72,93,0.35)",
                      borderRadius: 12,
                      color: "#dee5ff",
                      boxShadow: "0 16px 32px rgba(0,0,0,0.45)"
                    }}
                    labelStyle={{ color: "#dee5ff", fontWeight: 900 }}
                    itemStyle={{ color: "#dee5ff", fontWeight: 700 }}
                    labelFormatter={(label: unknown) => `Hora: ${String(label)}`}
                    formatter={(value: unknown) => [formatCOP(Number(value)), "Recaudo"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Recaudo"
                    stroke="rgba(105,246,184,0.9)"
                    strokeWidth={2}
                    fill="url(#rmCollectionsFill)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-highest/30 p-5">
                <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  Distribución por método
                </h3>
                {methodDonutForManager.data.length === 0 ? (
                  <p className="mt-4 text-sm text-on-surface-variant">Aún no hay recaudos hoy.</p>
                ) : (
                  <div className="mt-4 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          <filter id="rmDonutGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="rgba(105,246,184,0.15)" />
                          </filter>
                        </defs>
                        <Pie
                          data={methodDonutForManager.data}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={44}
                          outerRadius={72}
                          paddingAngle={3}
                          cornerRadius={10}
                          stroke="rgba(0,0,0,0)"
                          isAnimationActive={false}
                          filter="url(#rmDonutGlow)"
                        >
                          {methodDonutForManager.data.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "rgba(9,19,40,0.95)",
                            border: "1px solid rgba(64,72,93,0.35)",
                            borderRadius: 12,
                            color: "#dee5ff",
                            boxShadow: "0 16px 32px rgba(0,0,0,0.45)"
                          }}
                          labelStyle={{ color: "#dee5ff", fontWeight: 900 }}
                          itemStyle={{ color: "#dee5ff", fontWeight: 700 }}
                          formatter={(value: unknown) => [formatCOP(Number(value)), "Total"]}
                        />
                        <text
                          x="50%"
                          y="48%"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#dee5ff"
                          style={{
                            fontFamily: "var(--font-headline, Manrope), sans-serif",
                            fontWeight: 900,
                            fontSize: 16
                          }}
                        >
                          {formatCOP(methodDonutForManager.total)}
                        </text>
                        <text
                          x="50%"
                          y="66%"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#a3aac4"
                          style={{
                            fontFamily: "var(--font-body, Inter), sans-serif",
                            fontWeight: 700,
                            fontSize: 10,
                            letterSpacing: "0.18em"
                          }}
                        >
                          HOY
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-highest/30 p-5">
                <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  Métricas rápidas
                </h3>
                <div className="mt-4">
                  <div className="rutapay-table-wrap rounded-2xl border-0 bg-transparent shadow-none">
                    <table className="rutapay-table rutapay-table--responsive">
                      <thead>
                        <tr>
                          <th>Métrica</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedManagerMetricsRows.map((row) => (
                          <tr key={row.id}>
                            <td data-label="Métrica" className="text-on-surface">{row.label}</td>
                            <td data-label="Valor" data-mono="true">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={managerMetricsPage}
                    limit={managerMetricsLimit}
                    total={managerMetricsRows.length}
                    onPageChange={setManagerMetricsPage}
                    onLimitChange={(next) => {
                      setManagerMetricsLimit(next);
                      setManagerMetricsPage(1);
                    }}
                    className="rutapay-table-footer border-0 pt-0"
                  />
                </div>
              </div>
            </div>
          </article>

          <aside className="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-headline text-lg font-extrabold text-on-surface">Pagos recientes</h3>
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Hoy</span>
            </div>

            {recentPaymentsForManager.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Aún no hay pagos registrados hoy.</p>
            ) : (
              <div className="custom-scrollbar max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {recentPaymentsForManager.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-surface-container-high/40 p-3 transition-colors hover:bg-surface-container-high/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-on-surface">{p.clientName}</p>
                      <p className="text-xs text-on-surface-variant">
                        {formatBogotaDateFromString(typeof p.createdAt === "string" ? p.createdAt : p.createdAt.toISOString())} •{" "}
                        {p.method === "CASH" ? "Efectivo" : "Transferencia"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-primary">+{formatCOP(p.amount)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {p.status === "ACTIVE" ? "Activo" : "Reversado"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>
      </div>
    );
  }

  const adminSchedulesPending =
    isAdminView &&
    adminActiveLoanIds.length > 0 &&
    adminScheduleQueries.some((q) => q.isPending);

  const isLoadingAdmin =
    routesQuery.isLoading || loansQuery.isLoading || paymentsQuery.isLoading || adminSchedulesPending;
  const isErrorAdmin = routesQuery.isError || loansQuery.isError || paymentsQuery.isError;
  if (isLoadingAdmin) {
    return (
      <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
        <p className="text-sm text-textSecondary">Cargando métricas del dashboard...</p>
      </section>
    );
  }

  if (isErrorAdmin || !routesQuery.data || !loansQuery.data || !paymentsQuery.data) {
    return (
      <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
        <p className="text-sm text-danger">No fue posible cargar las métricas del dashboard.</p>
      </section>
    );
  }

  const routes = routesQuery.data.data;
  const loans = loansQuery.data.data;
  const payments = paymentsQuery.data.data;

  const adminScheduleItems = adminScheduleQueries.flatMap((q) => q.data?.data ?? []);
  const adminOverdueMoraCount = adminScheduleItems.filter((item) => {
    if (item.status === "PAID") {
      return false;
    }
    const dueKey =
      typeof item.dueDate === "string"
        ? toBogotaDayKey(item.dueDate)
        : toBogotaDayKeyFromDate(item.dueDate);
    return dueKey < todayKey;
  }).length;

  const totalBalance = routes.reduce((acc, item) => acc + item.balance, 0);
  const activeLoans = loans.filter((item) => item.status === "ACTIVE").length;
  const streetMoney = loans.reduce((acc, item) => acc + item.totalAmount, 0);
  const monthKey = todayKey.slice(0, 7);
  const recoveredMonth = payments
    .filter((p) => (p.status ?? "ACTIVE") === "ACTIVE")
    .filter((p) => toBogotaDayKey(p.createdAt).slice(0, 7) === monthKey)
    .reduce((acc, item) => acc + item.amount, 0);

  const delinquencyRatePct = (() => {
    const total = loans.length;
    if (total <= 0) return 0;
    const defaulted = loans.filter((l) => l.status === "DEFAULTED").length;
    return Math.round((defaulted / total) * 1000) / 10;
  })();

  const shiftMonthKey = (base: string, deltaMonths: number): string => {
    const [yRaw, mRaw] = base.split("-");
    const y = Number(yRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return base;
    const idx = (y * 12 + (m - 1)) + deltaMonths;
    const ny = Math.floor(idx / 12);
    const nm = (idx % 12 + 12) % 12;
    const mm = String(nm + 1).padStart(2, "0");
    return `${String(ny)}-${mm}`;
  };

  const recoveryTrend = (() => {
    const months = [-5, -4, -3, -2, -1, 0].map((d) => shiftMonthKey(monthKey, d));
    const byMonth: Record<string, number> = {};
    for (const m of months) byMonth[m] = 0;
    for (const p of payments) {
      if ((p.status ?? "ACTIVE") !== "ACTIVE") continue;
      const mk = toBogotaDayKey(p.createdAt).slice(0, 7);
      if (byMonth[mk] !== undefined) {
        byMonth[mk] += p.amount;
      }
    }
    return months.map((mk) => {
      const label = mk.split("-")[1] ?? mk;
      return { monthKey: mk, label, amount: byMonth[mk] ?? 0 };
    });
  })();

  const routeDistribution = (() => {
    const byRoute: Record<string, number> = {};
    for (const loan of loans) {
      byRoute[loan.routeId] = (byRoute[loan.routeId] ?? 0) + loan.totalAmount;
    }
    const total = Object.values(byRoute).reduce((s, v) => s + v, 0);
    const list = routes
      .map((r) => ({
        routeId: r.id,
        name: r.name,
        amount: byRoute[r.id] ?? 0,
        pct: total > 0 ? Math.round(((byRoute[r.id] ?? 0) / total) * 100) : 0
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { total, list };
  })();

  const statusCounts = [
    { name: "Activos", value: loans.filter((item) => item.status === "ACTIVE").length, color: "#3b82f6" },
    { name: "Completados", value: loans.filter((item) => item.status === "COMPLETED").length, color: "#22c55e" },
    { name: "En mora", value: loans.filter((item) => item.status === "DEFAULTED").length, color: "#ef4444" },
    {
      name: "Reestructurados",
      value: loans.filter((item) => item.status === "RESTRUCTURED").length,
      color: "#f59e0b"
    }
  ].filter((item) => item.value > 0);

  const loansTotalForChart = statusCounts.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface">Resumen del sistema</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Rendimiento de cartera y logística de recaudo en tiempo real.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/10 bg-surface-container-high px-4 py-2">
            <span className="material-symbols-outlined text-sm text-tertiary" aria-hidden>
              calendar_today
            </span>
            <span className="text-sm font-medium text-on-surface">Mes actual</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div className="rounded-xl bg-primary/10 p-3">
              <span className="material-symbols-outlined text-primary" aria-hidden>
                account_balance_wallet
              </span>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-on-surface-variant">Cartera Total</p>
            <p className="mt-1 font-headline text-3xl font-extrabold text-primary">{formatCOP(streetMoney)}</p>
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div className="rounded-xl bg-secondary/10 p-3">
              <span className="material-symbols-outlined text-secondary" aria-hidden>
                paid
              </span>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-on-surface-variant">Cobros del Mes</p>
            <p className="mt-1 font-headline text-3xl font-extrabold text-on-surface">{formatCOP(recoveredMonth)}</p>
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div className="rounded-xl bg-surface-container-highest p-3">
              <span className="material-symbols-outlined text-on-surface" aria-hidden>
                distance
              </span>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-on-surface-variant">Rutas Activas</p>
            <p className="mt-1 font-headline text-3xl font-extrabold text-on-surface">{String(routes.length)}</p>
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div className="rounded-xl bg-error/10 p-3">
              <span className="material-symbols-outlined text-error" aria-hidden>
                warning
              </span>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-on-surface-variant">En Mora</p>
            <p className="mt-1 font-headline text-3xl font-extrabold text-error">{String(delinquencyRatePct)}%</p>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 p-6 shadow-2xl backdrop-blur-xl lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-headline font-bold text-on-surface">Tendencia mensual de recaudo</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={recoveryTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="recoveryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(105,246,184,0.45)" />
                    <stop offset="100%" stopColor="rgba(105,246,184,0)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(64,72,93,0.25)" strokeDasharray="3 6" vertical={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(9,19,40,0.95)",
                    border: "1px solid rgba(64,72,93,0.35)",
                    borderRadius: 12,
                    color: "#dee5ff",
                    boxShadow: "0 16px 32px rgba(0,0,0,0.45)"
                  }}
                  labelStyle={{ color: "#dee5ff", fontWeight: 900 }}
                  itemStyle={{ color: "#dee5ff", fontWeight: 700 }}
                  formatter={(value: unknown) => [formatCOP(Number(value)), "Recaudo"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="rgba(105,246,184,0.9)"
                  strokeWidth={2}
                  fill="url(#recoveryFill)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="text-lg font-headline font-bold text-on-surface">Distribución por ruta</h2>
          <div className="mt-6 space-y-5">
            {routeDistribution.list.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No hay cartera por ruta para mostrar.</p>
            ) : (
              routeDistribution.list.slice(0, 6).map((row, idx) => {
                const tone =
                  idx === 0 ? "bg-primary" : idx === 1 ? "bg-secondary" : idx === 2 ? "bg-tertiary" : "bg-outline-variant/60";
                const toneText =
                  idx === 0 ? "text-primary" : idx === 1 ? "text-secondary" : idx === 2 ? "text-tertiary" : "text-on-surface-variant";
                return (
                  <div key={row.routeId} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-on-surface">{row.name}</span>
                      <span className={`font-bold ${toneText}`}>{row.pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container-highest/40 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-headline font-bold text-on-surface">Auditoría del sistema</h2>
            <p className="mt-1 text-xs uppercase tracking-widest text-on-surface-variant">Acciones administrativas recientes</p>
          </div>
        </div>

        <div className="rutapay-table-wrap rounded-none border-0 bg-transparent shadow-none">
          <table className="rutapay-table rutapay-table--responsive">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="text-on-surface-variant">
                    Cargando auditoría…
                  </td>
                </tr>
              ) : auditLogsQuery.isError ? (
                <tr>
                  <td colSpan={5} className="text-error">
                    {getErrorMessage(auditLogsQuery.error)}
                  </td>
                </tr>
              ) : (auditLogsQuery.data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-on-surface-variant">
                    No hay eventos de auditoría.
                  </td>
                </tr>
              ) : (
                (auditLogsQuery.data?.data ?? []).map((row) => (
                  <tr key={row.id}>
                    <td data-label="Timestamp" className="text-xs text-on-surface-variant">
                      {formatBogotaDateFromString(row.createdAt)}
                    </td>
                    <td data-label="Actor" className="text-on-surface">{row.actorName}</td>
                    <td data-label="Acción" className="text-on-surface-variant">{row.action}</td>
                    <td
                      data-label="Recurso"
                      data-mono="true"
                    >{`${row.resourceType}${row.resourceId ? `#${row.resourceId.slice(0, 8)}` : ""}`}</td>
                    <td data-label="Estado">
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">
                        Éxito
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {auditLogsQuery.data ? (
          <div className="px-6 pb-6 pt-2">
            <TablePagination
              page={auditPage}
              limit={auditLimit}
              total={auditLogsQuery.data.total}
              onPageChange={setAuditPage}
              onLimitChange={(next) => {
                setAuditLimit(next);
                setAuditPage(1);
              }}
              className="rutapay-table-footer border-0 pt-0"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default OverviewPage;
