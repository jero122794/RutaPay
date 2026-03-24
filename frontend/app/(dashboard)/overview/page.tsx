// frontend/app/(dashboard)/overview/page.tsx
"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { formatCOP } from "../../../lib/formatters";
import { useAuthStore } from "../../../store/authStore";
import TablePagination from "../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import {
  getBogotaTodayKey,
  toBogotaDayKey,
  toBogotaDayKeyFromDate
} from "../../../lib/bogota";

interface RouteItem {
  id: string;
  name: string;
  managerId: string;
  balance: number;
}

interface LoanItem {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  totalAmount: number;
}

interface PaymentItem {
  id: string;
  amount: number;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
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
        : "border border-white/5";

  return (
    <article className={`rounded-2xl bg-surface-container p-5 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{title}</p>
      <p className="mt-3 font-mono text-2xl font-bold leading-tight tracking-tight text-on-surface md:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </article>
  );
};

const OverviewPage = (): JSX.Element => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [managerMetricsPage, setManagerMetricsPage] = useState(1);
  const [managerMetricsLimit, setManagerMetricsLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const user = useAuthStore((state) => state.user);
  const role = user?.roles[0] ?? "CLIENT";
  const isAdminView = role === "ADMIN" || role === "SUPER_ADMIN";
  const isRouteManagerView = role === "ROUTE_MANAGER";

  const routesQuery = useQuery({
    queryKey: ["routes-overview"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: isAdminView
  });

  const loansQuery = useQuery({
    queryKey: ["loans-overview"],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans");
      return response.data;
    },
    enabled: isAdminView
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments-overview"],
    queryFn: async (): Promise<ListResponse<PaymentItem>> => {
      const response = await api.get<ListResponse<PaymentItem>>("/payments");
      return response.data;
    },
    enabled: isAdminView
  });

  const todayKey = getBogotaTodayKey();

  const routeManagerClientsQuery = useQuery({
    queryKey: ["route-manager-clients"],
    queryFn: async (): Promise<ListResponse<RouteManagerClientItem>> => {
      const response = await api.get<ListResponse<RouteManagerClientItem>>("/clients");
      return response.data;
    },
    enabled: isRouteManagerView
  });

  const routeManagerRouteId = routeManagerClientsQuery.data?.data[0]?.routeId ?? "";

  const routeManagerLoansQuery = useQuery({
    queryKey: ["route-manager-loans"],
    queryFn: async (): Promise<ListResponse<RouteManagerLoanItem>> => {
      const response = await api.get<ListResponse<RouteManagerLoanItem>>("/loans");
      return response.data;
    },
    enabled: isRouteManagerView
  });

  const routeManagerPaymentsQuery = useQuery({
    queryKey: ["route-manager-payments"],
    queryFn: async (): Promise<ListResponse<RouteManagerPaymentItem>> => {
      const response = await api.get<ListResponse<RouteManagerPaymentItem>>("/payments");
      return response.data;
    },
    enabled: isRouteManagerView
  });

  const routeManagerTreasuryBalanceQuery = useQuery({
    queryKey: ["route-manager-treasury-balance", routeManagerRouteId],
    queryFn: async (): Promise<{ data: RouteBalanceResponse }> => {
      const response = await api.get<{ data: RouteBalanceResponse }>(
        `/treasury/balance/${routeManagerRouteId}`
      );
      return response.data;
    },
    enabled: isRouteManagerView && Boolean(routeManagerRouteId)
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
      enabled: isRouteManagerView
    }))
  });

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
  };

  type RouteBalanceResponse = {
    routeId: string;
    currentBalance: number;
  };

  type RouteManagerLoanScheduleItem = {
    installmentNumber: number;
    dueDate: string | Date;
    status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
  };

  const routeManagerScheduleItems = scheduleQueries.flatMap(
    (q) => (q.data?.data ?? []) as RouteManagerLoanScheduleItem[]
  );

  if (!isHydrated) {
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
    { id: "clients", label: "Mis clientes", value: String(routeManagerClientsQuery.data?.data.length ?? 0) },
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
      routeManagerPaymentsQuery.isLoading;

    if (isLoading) {
      return (
        <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <p className="text-sm text-textSecondary">Cargando tu panel...</p>
        </section>
      );
    }

    const balance = routeManagerTreasuryBalanceQuery.data?.data.currentBalance ?? 0;

    return (
      <div className="space-y-8">
        <section className="flex items-center justify-between">
          <h1 className="font-headline text-3xl font-bold text-on-surface">Panel de Control</h1>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-container to-blue-800 p-6 shadow-lg">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">Saldo disponible</p>
            <p className="mt-3 font-mono text-2xl font-bold leading-tight tracking-tight text-white md:text-3xl">{formatCOP(balance)}</p>
            <p className="mt-2 text-xs text-white/80">Disponible en tesorería de tu ruta</p>
          </article>
          <StatCard title="Cobros de hoy" value={formatCOP(receivedTodayTotal)} hint="Cobros exitosos registrados" tone="cyan" />
          <StatCard title="Cuotas pendientes" value={String(dueTodayCount)} hint="Programadas para hoy" tone="emerald" />
          <article className="rounded-2xl border border-error/20 bg-error-container/20 p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-error">En mora</p>
            <p className="mt-3 font-mono text-2xl font-bold leading-tight tracking-tight text-on-surface md:text-3xl">{String(routeManagerScheduleItems.filter((i) => i.status === "OVERDUE").length)}</p>
            <p className="mt-2 text-xs text-slate-400">Cuotas vencidas críticas</p>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/5 bg-surface-container">
          <div className="flex items-center justify-between border-b border-white/5 p-6">
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Cobros de Hoy</h2>
            <div className="flex gap-2">
              <button className="rounded-lg bg-blue-400/10 px-4 py-2 text-xs font-bold text-blue-400">Exportar</button>
              <button className="rounded-lg bg-white/5 px-4 py-2 text-xs font-bold text-on-surface">Ver historial</button>
            </div>
          </div>
          <div className="rutapay-table-wrap rounded-none border-0 bg-transparent shadow-none">
            <table className="rutapay-table">
              <thead>
                <tr className="bg-white/[0.02] text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-6 py-4">Métrica</th>
                  <th className="px-6 py-4">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pagedManagerMetricsRows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 text-sm text-on-surface">{row.label}</td>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-on-surface">{row.value}</td>
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
          />
        </section>
      </div>
    );
  }

  const isLoadingAdmin = routesQuery.isLoading || loansQuery.isLoading || paymentsQuery.isLoading;
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

  const totalBalance = routes.reduce((acc, item) => acc + item.balance, 0);
  const activeLoans = loans.filter((item) => item.status === "ACTIVE").length;
  const defaultedLoans = loans.filter((item) => item.status === "DEFAULTED").length;
  const streetMoney = loans.reduce((acc, item) => acc + item.totalAmount, 0);
  const recoveredToday = payments.reduce((acc, item) => acc + item.amount, 0);

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

  return (
    <div className="space-y-8">
      <section className="flex items-center justify-between">
        <h1 className="font-headline text-3xl font-bold text-on-surface">Panel de Control</h1>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-container to-blue-800 p-6 shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">Cartera total</p>
          <p className="mt-3 font-mono text-2xl font-bold leading-tight tracking-tight text-white md:text-3xl">{formatCOP(streetMoney)}</p>
          <p className="mt-2 text-xs text-white/80">Saldo total de préstamos</p>
        </article>
        <StatCard title="Cobros del mes" value={formatCOP(recoveredToday)} hint="Pagos registrados" tone="cyan" />
        <StatCard title="Rutas activas" value={String(routes.length)} hint="Total rutas registradas" tone="emerald" />
        <article className="rounded-2xl border border-error/20 bg-error-container/20 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-error">En mora</p>
          <p className="mt-3 font-mono text-2xl font-bold leading-tight tracking-tight text-on-surface md:text-3xl">{String(defaultedLoans)}</p>
          <p className="mt-2 text-xs text-slate-400">Préstamos con riesgo</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="overflow-hidden rounded-2xl border border-white/5 bg-surface-container xl:col-span-2">
          <div className="border-b border-white/5 p-6">
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Distribución de cartera</h2>
          </div>
          <div className="p-6">
            {statusCounts.length === 0 ? (
              <p className="text-sm text-textSecondary">No hay préstamos para graficar.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusCounts} dataKey="value" nameKey="name" outerRadius={100} label>
                      {statusCounts.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <h2 className="font-headline text-xl font-extrabold text-on-surface">Resumen rápido</h2>
          <ul className="mt-4 space-y-3 text-sm text-textSecondary">
            <li>Total pagos registrados: <span className="font-mono text-on-surface">{payments.length}</span></li>
            <li>Total recuperado: <span className="font-mono text-on-surface">{formatCOP(recoveredToday)}</span></li>
            <li>Cartera total activa: <span className="font-mono text-on-surface">{formatCOP(streetMoney)}</span></li>
            <li>Rutas con saldo: <span className="font-mono text-on-surface">{routes.filter((item) => item.balance > 0).length}</span></li>
            <li>Saldo total rutas: <span className="font-mono text-on-surface">{formatCOP(totalBalance)}</span></li>
            <li>Préstamos activos: <span className="font-mono text-on-surface">{activeLoans}</span></li>
          </ul>
        </article>
      </section>
    </div>
  );
};

export default OverviewPage;
