// frontend/app/(dashboard)/routes/[id]/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { formatCOP } from "../../../../lib/formatters";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type PageSize } from "../../../../lib/page-size";

interface RouteDetailResponse {
  data: {
    id: string;
    name: string;
    managerId: string;
    balance: number;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
}

interface RouteSummaryResponse {
  data: {
    route: {
      id: string;
      name: string;
      managerId: string;
      managerName: string;
      balance: number;
      createdAt: string | Date;
      updatedAt: string | Date;
    };
    clientsCount: number;
    activeLoans: number;
    portfolioTotal: number;
    principalLoaned: number;
    projectedInterest: number;
    availableToLend: number;
    overdueInstallments: number;
    payments: {
      id: string;
      clientName: string;
      installmentAmount: number;
      status: "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" | "REGISTERED";
      createdAt: string | Date;
    }[];
  };
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const msg = (error.response?.data as { message?: string } | undefined)?.message;
    return msg ?? error.message;
  }
  return "Error desconocido.";
};

const formatCompactCOP = (value: number): string => {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    const s = m >= 10 ? m.toFixed(0) : m.toFixed(1);
    return `$ ${s.replace(".", ",")}M`;
  }
  return formatCOP(value);
};

const formatBogotaDateTime = (value: string | Date): string => {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
};

const paymentStatusLabel: Record<
  "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" | "REGISTERED",
  string
> = {
  PAID: "Pagada",
  PARTIAL: "Parcial",
  OVERDUE: "Vencida",
  PENDING: "Pendiente",
  REGISTERED: "Registrado"
};

const paymentStatusTone = (
  s: RouteSummaryResponse["data"]["payments"][0]["status"]
): string => {
  switch (s) {
    case "PAID":
      return "border-primary/20 bg-primary/10 text-primary";
    case "OVERDUE":
      return "border-error/20 bg-error/10 text-error";
    case "PARTIAL":
      return "border-tertiary/20 bg-tertiary/10 text-tertiary";
    default:
      return "border-outline-variant/20 bg-surface-container-highest text-on-surface-variant";
  }
};

const RouteDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const routeId = params.id;
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const canView = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";
  const canCreditRoute = role === "ADMIN" || role === "SUPER_ADMIN";

  const routeQuery = useQuery({
    queryKey: ["route-detail", routeId],
    queryFn: async (): Promise<RouteDetailResponse> => {
      const response = await api.get<RouteDetailResponse>(`/routes/${routeId}`);
      return response.data;
    },
    enabled: canView && Boolean(routeId)
  });

  const summaryQuery = useQuery({
    queryKey: ["route-summary", routeId],
    queryFn: async (): Promise<RouteSummaryResponse> => {
      const response = await api.get<RouteSummaryResponse>(`/routes/${routeId}/summary`);
      return response.data;
    },
    enabled: canView && Boolean(routeId)
  });

  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsLimit, setPaymentsLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [sortRecent, setSortRecent] = useState(true);

  const routePayments = summaryQuery.data?.data.payments ?? [];

  const filteredSortedPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    let rows = [...routePayments];
    if (q) {
      rows = rows.filter((p) => p.clientName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    if (sortRecent) {
      rows.sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
    } else {
      rows.sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));
    }
    return rows;
  }, [paymentSearch, routePayments, sortRecent]);

  const pagedRoutePayments = useMemo(() => {
    const start = (paymentsPage - 1) * paymentsLimit;
    return filteredSortedPayments.slice(start, start + paymentsLimit);
  }, [filteredSortedPayments, paymentsPage, paymentsLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredSortedPayments.length / paymentsLimit));
    if (paymentsPage > totalPages) {
      setPaymentsPage(totalPages);
    }
  }, [filteredSortedPayments.length, paymentsLimit, paymentsPage]);

  const portfolioUtilPct = useMemo((): number => {
    const d = summaryQuery.data?.data;
    if (!d) return 0;
    const cap = d.principalLoaned + Math.max(0, d.availableToLend);
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((d.principalLoaned / cap) * 1000) / 10);
  }, [summaryQuery.data]);

  const balanceTrendHint = useMemo((): string => {
    const bal = routeQuery.data?.data.balance ?? 0;
    if (bal === 0) return "Sin saldo en caja asignado.";
    if (bal >= 1_000_000) return "Saldo operativo disponible en ruta.";
    return "Saldo bajo; revisa cobranza y cupo.";
  }, [routeQuery.data]);

  const totalPages = Math.max(1, Math.ceil(filteredSortedPayments.length / paymentsLimit));
  const safePayPage = Math.min(Math.max(1, paymentsPage), totalPages);
  const payFrom = filteredSortedPayments.length === 0 ? 0 : (safePayPage - 1) * paymentsLimit + 1;
  const payTo = Math.min(safePayPage * paymentsLimit, filteredSortedPayments.length);

  const paginationButtons = useMemo((): Array<number | "ellipsis"> => {
    const tp = totalPages;
    const sp = safePayPage;
    if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);
    const out: Array<number | "ellipsis"> = [1];
    const ws = Math.max(2, sp - 1);
    const we = Math.min(tp - 1, sp + 1);
    if (ws > 2) out.push("ellipsis");
    for (let p = ws; p <= we; p += 1) out.push(p);
    if (we < tp - 1) out.push("ellipsis");
    out.push(tp);
    return out;
  }, [safePayPage, totalPages]);

  if (!canView) {
    return (
      <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
        <h1 className="font-headline text-xl font-semibold text-on-surface">Rutas</h1>
        <p className="mt-2 text-sm text-error">No tienes permisos para ver el resumen de rutas.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto min-h-screen max-w-7xl space-y-8 bg-surface px-4 pb-16 pt-4 antialiased md:px-8">
      {routeQuery.isError ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
          <p className="text-sm text-error">{getErrorMessage(routeQuery.error)}</p>
        </div>
      ) : null}

      {summaryQuery.isError ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
          <p className="text-sm text-error">{getErrorMessage(summaryQuery.error)}</p>
        </div>
      ) : null}

      {routeQuery.isLoading || summaryQuery.isLoading ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-8">
          <p className="text-sm text-on-surface-variant">Cargando resumen…</p>
        </div>
      ) : null}

      {routeQuery.data?.data && summaryQuery.data?.data ? (
        <>
          <section className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Link
                href="/routes"
                className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary transition-transform hover:-translate-x-1"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  arrow_back
                </span>
                Volver a rutas
              </Link>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface md:text-4xl">
                  Detalle de la ruta: {summaryQuery.data.data.route.name}
                </h1>
                <span className="w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  Activa
                </span>
              </div>
              <p className="mt-1 text-sm text-on-surface-variant">
                Encargado: {summaryQuery.data.data.route.managerName}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-xl border border-outline-variant/30 px-6 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
              >
                Descargar reporte
              </button>
              <Link
                href="/payments"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container px-6 py-2.5 text-sm font-bold text-on-primary shadow-[0_12px_32px_rgba(105,246,184,0.15)] transition-transform hover:scale-105"
              >
                Nueva cobranza
              </Link>
            </div>
          </section>

          <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-3xl border border-outline-variant/5 bg-surface-container-low p-6 shadow-xl">
              <div>
                <p className="mb-1 text-xs font-bold tracking-[0.15em] text-on-surface-variant">Clientes</p>
                <p className="font-headline text-4xl font-extrabold text-on-surface">
                  {summaryQuery.data.data.clientsCount}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-highest p-4 text-secondary">
                <span className="material-symbols-outlined text-3xl" aria-hidden>
                  group
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-3xl border border-outline-variant/5 bg-surface-container-low p-6 shadow-xl">
              <div>
                <p className="mb-1 text-xs font-bold tracking-[0.15em] text-on-surface-variant">Préstamos activos</p>
                <p className="font-headline text-4xl font-extrabold text-on-surface">
                  {summaryQuery.data.data.activeLoans}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-highest p-4 text-primary">
                <span className="material-symbols-outlined text-3xl" aria-hidden>
                  account_balance_wallet
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-3xl border border-outline-variant/5 bg-surface-container-low p-6 shadow-xl">
              <div>
                <p className="mb-1 text-xs font-bold tracking-[0.15em] text-on-surface-variant">Mora (cuotas vencidas)</p>
                <p className="font-headline text-4xl font-extrabold text-error">
                  {summaryQuery.data.data.overdueInstallments}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-highest p-4 text-error">
                <span className="material-symbols-outlined text-3xl" aria-hidden>
                  event_busy
                </span>
              </div>
            </div>
          </section>

          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:col-span-3">
              <div className="rounded-3xl border border-outline-variant/5 bg-surface-container-high p-8">
                <p className="mb-4 text-[10px] font-black tracking-[0.2em] text-on-surface-variant">
                  CARTERA ACTIVA (TOTAL)
                </p>
                <h3 className="mb-2 text-3xl font-extrabold tracking-[-0.02em] text-on-surface" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
                  {formatCOP(summaryQuery.data.data.portfolioTotal)}
                </h3>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${portfolioUtilPct}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">
                  {portfolioUtilPct}% del cupo operativo utilizado (capital activo / capital + disponible)
                </p>
              </div>
              <div className="rounded-3xl border border-outline-variant/5 bg-surface-container-high p-8">
                <p className="mb-4 text-[10px] font-black tracking-[0.2em] text-on-surface-variant">BALANCE DE RUTA</p>
                <h3 className="mb-2 text-3xl font-extrabold tracking-[-0.02em] text-tertiary" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
                  {formatCOP(routeQuery.data.data.balance)}
                </h3>
                <div className="mt-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-tertiary" aria-hidden>
                    trending_up
                  </span>
                  <p className="text-xs text-on-surface-variant">{balanceTrendHint}</p>
                </div>
              </div>
              <div className="rounded-3xl border border-outline-variant/5 bg-surface-container-high p-8">
                <p className="mb-4 text-[10px] font-black tracking-[0.2em] text-on-surface-variant">
                  CAPITAL PRESTADO (ACTIVO)
                </p>
                <h3 className="text-2xl font-bold tracking-[-0.02em] text-on-surface" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
                  {formatCOP(summaryQuery.data.data.principalLoaned)}
                </h3>
                <p className="mt-2 text-xs text-on-surface-variant">Monto principal colocado en préstamos activos</p>
              </div>
              <div className="rounded-3xl border border-outline-variant/5 bg-surface-container-high p-8">
                <p className="mb-4 text-[10px] font-black tracking-[0.2em] text-on-surface-variant">
                  INTERÉS PROYECTADO (ACTIVO)
                </p>
                <h3 className="text-2xl font-bold tracking-[-0.02em] text-on-surface" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
                  {formatCOP(summaryQuery.data.data.projectedInterest)}
                </h3>
                <p className="mt-2 text-xs text-on-surface-variant">Estimación según cartera vigente</p>
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-3xl border border-primary/20 bg-surface-container-highest p-8 text-center shadow-[0_0_40px_rgba(105,246,184,0.05)]">
              <p className="mb-4 text-xs font-black tracking-[0.2em] text-primary">DISPONIBLE PARA PRESTAR</p>
              <div className="mb-6">
                <span className="text-5xl font-extrabold tracking-[-0.02em] text-primary" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
                  {formatCompactCOP(summaryQuery.data.data.availableToLend)}
                </span>
              </div>
              {canCreditRoute ? (
                <Link
                  href="/treasury"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 py-4 font-bold text-primary transition-all hover:bg-primary hover:text-on-primary"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden>
                    add_circle
                  </span>
                  Asignar cupo
                </Link>
              ) : (
                <p className="text-xs text-on-surface-variant">
                  El crédito a ruta lo gestiona administración en Tesorería.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-outline-variant/5 bg-surface-container-low p-6 shadow-2xl md:p-8">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-headline text-xl font-bold text-on-surface">Pagos de la ruta</h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-56">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
                    search
                  </span>
                  <input
                    className="w-full rounded-xl border-none bg-surface-container-highest py-2 pl-9 pr-3 text-xs text-on-surface placeholder:text-on-surface-variant focus:ring-1 focus:ring-primary/40"
                    placeholder="Filtrar por cliente…"
                    value={paymentSearch}
                    onChange={(e) => {
                      setPaymentSearch(e.target.value);
                      setPaymentsPage(1);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-xl bg-surface-container-highest px-4 py-2 text-xs font-medium transition-colors ${
                    sortRecent ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  onClick={() => {
                    setSortRecent(true);
                    setPaymentsPage(1);
                  }}
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden>
                    sort
                  </span>
                  Recientes
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-xl bg-surface-container-highest px-4 py-2 text-xs font-medium transition-colors ${
                    !sortRecent ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  onClick={() => {
                    setSortRecent(false);
                    setPaymentsPage(1);
                  }}
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden>
                    filter_list
                  </span>
                  Por cliente
                </button>
              </div>
            </div>

            {filteredSortedPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-90">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-surface-container-highest">
                  <span className="material-symbols-outlined text-5xl text-outline" aria-hidden>
                    receipt_long
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-on-surface">
                  {routePayments.length === 0
                    ? "No hay pagos registrados en esta ruta"
                    : "Ningún pago coincide con el filtro"}
                </h3>
                <p className="max-w-xs text-sm text-on-surface-variant">
                  Registra cobros desde Pagos para ver el historial aquí.
                </p>
                <Link
                  href="/payments"
                  className="mt-8 rounded-xl border border-primary/40 px-6 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/5"
                >
                  Ir a pagos
                </Link>
              </div>
            ) : (
              <>
                <div className="rutapay-table-wrap custom-scrollbar">
                  <table className="rutapay-table rutapay-table--responsive">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Monto</th>
                        <th>Fecha / hora</th>
                        <th>Estado</th>
                        <th className="text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRoutePayments.map((payment) => (
                        <tr key={payment.id}>
                          <td data-label="Cliente" className="font-medium text-on-surface">{payment.clientName}</td>
                          <td data-label="Monto" className="font-bold text-primary">{formatCOP(payment.installmentAmount)}</td>
                          <td data-label="Fecha / hora">{formatBogotaDateTime(payment.createdAt)}</td>
                          <td data-label="Estado">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-tighter ${paymentStatusTone(payment.status)}`}
                            >
                              {paymentStatusLabel[payment.status]}
                            </span>
                          </td>
                          <td data-no-label="true" data-align="end" className="text-right">
                            <Link
                              href="/payments"
                              className="text-sm font-semibold text-primary hover:underline"
                            >
                              Ver
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-outline-variant/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-on-surface-variant">
                    Mostrando <span className="font-bold text-on-surface">{payFrom}</span>–
                    <span className="font-bold text-on-surface">{payTo}</span> de{" "}
                    <span className="font-bold text-on-surface">{filteredSortedPayments.length}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="mr-2 flex items-center gap-2 text-xs text-on-surface-variant">
                      <span>Filas</span>
                      <select
                        className="rounded-lg border border-outline-variant/20 bg-surface-container-highest px-2 py-1.5 text-xs text-on-surface"
                        value={paymentsLimit}
                        onChange={(e) => {
                          setPaymentsLimit(Number(e.target.value) as PageSize);
                          setPaymentsPage(1);
                        }}
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={safePayPage <= 1}
                      className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant transition-all hover:bg-surface-container-highest disabled:opacity-30"
                      onClick={() => setPaymentsPage(safePayPage - 1)}
                      aria-label="Anterior"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden>
                        chevron_left
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      {paginationButtons.map((item, idx) =>
                        item === "ellipsis" ? (
                          <span key={`e-${idx}`} className="px-1 text-xs text-on-surface-variant">
                            …
                          </span>
                        ) : (
                          <button
                            key={item}
                            type="button"
                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                              item === safePayPage
                                ? "bg-primary text-on-primary"
                                : "text-on-surface-variant hover:bg-surface-container-highest"
                            }`}
                            onClick={() => setPaymentsPage(item)}
                          >
                            {item}
                          </button>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={safePayPage >= totalPages}
                      className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant transition-all hover:bg-surface-container-highest disabled:opacity-30"
                      onClick={() => setPaymentsPage(safePayPage + 1)}
                      aria-label="Siguiente"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden>
                        chevron_right
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
};

export default RouteDetailPage;
