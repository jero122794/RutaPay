// frontend/app/(dashboard)/loans/page.tsx
"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type PageSize } from "../../../lib/page-size";
import api from "../../../lib/api";
import { getBogotaYMD, formatBogotaDateFromString, toBogotaDayKey } from "../../../lib/bogota";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatCOP } from "../../../lib/formatters";

interface LoanItem {
  id: string;
  routeId: string;
  clientId: string;
  managerId: string;
  principal: number;
  interestRate: number;
  installmentCount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  startDate: string;
  endDate: string;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface ClientName {
  id: string;
  name: string;
}

interface RouteRow {
  id: string;
  name: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  status: "ACTIVE" | "REVERSED";
  createdAt: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] ?? "?";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
};

const formatCompactCOP = (value: number): string => {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    const s = m >= 10 ? m.toFixed(0) : m.toFixed(1);
    return `$ ${s.replace(".", ",")}M`;
  }
  return formatCOP(value);
};

type StepVariant = "done" | "current" | "pending" | "alert";

/** Haystack per row: cliente, IDs, monto, palabras de estado (ES/EN) y enum en minúsculas. */
const loanSearchHayForRow = (loan: LoanItem, clientName: string): string => {
  const statusBits: Record<LoanItem["status"], string> = {
    ACTIVE: "activo activa active",
    COMPLETED: "finalizado finalizada completado completada completed",
    DEFAULTED: "mora defaulted vencido vencida en mora",
    RESTRUCTURED: "reestructurado reestructurada restructured"
  };
  return [
    clientName,
    loan.id,
    loan.clientId,
    formatCOP(loan.totalAmount),
    statusBits[loan.status],
    loan.status.toLowerCase()
  ]
    .join(" ")
    .toLowerCase();
};

const statusPill = (status: LoanItem["status"]): JSX.Element => {
  switch (status) {
    case "ACTIVE":
      return (
        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          Activo
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center rounded-full border border-outline-variant/30 bg-outline-variant/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          Finalizado
        </span>
      );
    case "DEFAULTED":
      return (
        <span className="inline-flex items-center rounded-full border border-error/20 bg-error/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-error">
          Mora
        </span>
      );
    case "RESTRUCTURED":
      return (
        <span className="inline-flex items-center rounded-full border border-tertiary/30 bg-tertiary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-tertiary">
          Reestructurado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-outline-variant/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          —
        </span>
      );
  }
};

const LoansPage = (): JSX.Element => {
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const clientDisplayNameForClientRole = role === "CLIENT" ? user?.name ?? "-" : "-";

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");

  const loansQuery = useQuery({
    queryKey: ["loans-list", page, limit],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans", {
        params: { page, limit }
      });
      return response.data;
    },
    enabled: hasAuthHydrated
  });

  const loansStatsQuery = useQuery({
    queryKey: ["loans-list-stats-wide"],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      // Backend pagination only allows limit 10/20/50/100. For stats, request without pagination.
      const response = await api.get<ListResponse<LoanItem>>("/loans");
      return response.data;
    },
    enabled: hasAuthHydrated
  });

  const paymentsTodayQuery = useQuery({
    queryKey: ["loans-payments-today-stats", getBogotaYMD()],
    queryFn: async (): Promise<ListResponse<PaymentRow>> => {
      // Backend pagination only allows limit 10/20/50/100. For stats, request without pagination.
      const response = await api.get<ListResponse<PaymentRow>>("/payments");
      return response.data;
    },
    enabled: hasAuthHydrated && role !== "CLIENT"
  });

  const routesQuery = useQuery({
    queryKey: ["loans-routes-for-stepper"],
    queryFn: async (): Promise<ListResponse<RouteRow>> => {
      const response = await api.get<ListResponse<RouteRow>>("/routes", {
        params: { page: 1, limit: 100 }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && role !== "CLIENT"
  });

  useEffect(() => {
    const d = loansQuery.data;
    if (!d) return;
    if (d.page !== page) setPage(d.page);
  }, [loansQuery.data, page]);

  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";

  const clientIds = useMemo<string[]>(() => {
    const ids = loansQuery.data?.data.map((l) => l.clientId) ?? [];
    return Array.from(new Set(ids));
  }, [loansQuery.data]);

  const canFetchClientNames = role !== "CLIENT" && clientIds.length > 0;

  const clientNameQueries = useQueries({
    queries: clientIds.map((clientId) => ({
      queryKey: ["client-name", clientId],
      queryFn: async (): Promise<ClientName> => {
        const response = await api.get<{ data: ClientName }>(`/clients/${clientId}`);
        return response.data.data;
      },
      enabled: hasAuthHydrated && canFetchClientNames
    }))
  });

  const clientNameById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    clientIds.forEach((id, index) => {
      const data = clientNameQueries[index]?.data;
      if (data?.name) map[id] = data.name;
    });
    return map;
  }, [clientIds, clientNameQueries]);

  const statsLoans = loansStatsQuery.data?.data ?? [];
  const portfolioStats = useMemo(() => {
    const active = statsLoans.filter((l) => l.status === "ACTIVE").length;
    const mora = statsLoans.filter((l) => l.status === "DEFAULTED").length;
    const capital = statsLoans.reduce((s, l) => s + l.principal, 0);
    return { active, mora, capital };
  }, [statsLoans]);

  const todayKey = getBogotaYMD();
  const collectedToday = useMemo(() => {
    const rows = paymentsTodayQuery.data?.data ?? [];
    return rows
      .filter((p) => p.status === "ACTIVE")
      .filter((p) => toBogotaDayKey(p.createdAt) === todayKey)
      .reduce((s, p) => s + p.amount, 0);
  }, [paymentsTodayQuery.data, todayKey]);

  const routeSteps = useMemo(() => {
    const routes = [...(routesQuery.data?.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (routes.length === 0) return [];
    let pulseAssigned = false;
    return routes.slice(0, 8).map((route) => {
      const ls = statsLoans.filter((l) => l.routeId === route.id);
      if (ls.some((l) => l.status === "DEFAULTED")) {
        return { route, variant: "alert" as StepVariant };
      }
      if (ls.some((l) => l.status === "ACTIVE")) {
        if (!pulseAssigned) {
          pulseAssigned = true;
          return { route, variant: "current" as StepVariant };
        }
        return { route, variant: "done" as StepVariant };
      }
      if (ls.length === 0) {
        return { route, variant: "pending" as StepVariant };
      }
      return { route, variant: "done" as StepVariant };
    });
  }, [routesQuery.data, statsLoans]);

  const filteredRows = useMemo(() => {
    const rows = loansQuery.data?.data ?? [];
    const tokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter((loan) => {
      const clientName =
        role === "CLIENT" ? clientDisplayNameForClientRole : clientNameById[loan.clientId] ?? "";
      const hay = loanSearchHayForRow(loan, clientName);
      return tokens.every((t) => hay.includes(t));
    });
  }, [clientDisplayNameForClientRole, clientNameById, loansQuery.data, role, search]);

  const totalPages = Math.max(1, Math.ceil((loansQuery.data?.total ?? 0) / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = loansQuery.data?.total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = loansQuery.data ? Math.min(safePage * limit, loansQuery.data.total) : 0;

  const paginationButtons = useMemo((): Array<number | "ellipsis"> => {
    const tp = totalPages;
    const sp = safePage;
    if (tp <= 7) {
      return Array.from({ length: tp }, (_, i) => i + 1);
    }
    const out: Array<number | "ellipsis"> = [1];
    const windowStart = Math.max(2, sp - 1);
    const windowEnd = Math.min(tp - 1, sp + 1);
    if (windowStart > 2) out.push("ellipsis");
    for (let p = windowStart; p <= windowEnd; p += 1) out.push(p);
    if (windowEnd < tp - 1) out.push("ellipsis");
    out.push(tp);
    return out;
  }, [safePage, totalPages]);

  if (!hasAuthHydrated) {
    return (
      <section className="mx-auto w-full max-w-7xl space-y-8 p-4 md:p-8">
        <div className="rounded-2xl border border-outline-variant/5 bg-surface-container-low p-8">
          <p className="text-sm text-on-surface-variant">Cargando préstamos…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-8 p-4 md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Préstamos</h1>
          <p className="mt-1 text-on-surface-variant">Supervisión centralizada de carteras activas y mora.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="material-symbols-outlined text-outline" aria-hidden>
                search
              </span>
            </div>
            <input
              className="block w-full rounded-xl border-none bg-surface-container-lowest py-2.5 pl-10 pr-3 text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary/50"
              placeholder="Cliente, ID, monto… o estado (activo, mora, finalizado…)"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar préstamos por cliente, ID, monto o estado"
            />
          </div>
          {canCreate ? (
            <Link
              href="/loans/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container px-6 py-3 font-bold text-on-primary shadow-[0_8px_20px_rgba(105,246,184,0.3)] transition-all hover:shadow-[0_12px_28px_rgba(105,246,184,0.4)] active:scale-[0.96]"
            >
              <span className="material-symbols-outlined" aria-hidden>
                add_circle
              </span>
              Crear préstamo
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-container-low p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Total activos</p>
            <p className="font-headline text-2xl font-black text-primary">
              {loansStatsQuery.isLoading || loansStatsQuery.isError ? "—" : portfolioStats.active}
            </p>
          </div>
          <span className="material-symbols-outlined text-4xl text-primary/40" aria-hidden>
            trending_up
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-container-low p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">En mora</p>
            <p className="font-headline text-2xl font-black text-error">
              {loansStatsQuery.isLoading || loansStatsQuery.isError ? "—" : portfolioStats.mora}
            </p>
          </div>
          <span className="material-symbols-outlined text-4xl text-error/40" aria-hidden>
            warning
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-container-low p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Capital total</p>
            <p className="font-headline text-2xl font-black text-on-surface">
              {loansStatsQuery.isLoading || loansStatsQuery.isError ? "—" : formatCompactCOP(portfolioStats.capital)}
            </p>
          </div>
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40" aria-hidden>
            payments
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-container-low p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Recaudo hoy</p>
            <p className="font-headline text-2xl font-black text-tertiary">
              {role === "CLIENT" || paymentsTodayQuery.isLoading || paymentsTodayQuery.isError
                ? "—"
                : formatCompactCOP(collectedToday)}
            </p>
          </div>
          <span className="material-symbols-outlined text-4xl text-tertiary/40" aria-hidden>
            account_balance
          </span>
        </div>
      </div>

      {loansStatsQuery.isError ? (
        <div className="rounded-2xl border border-outline-variant/5 bg-surface-container-low p-6">
          <p className="text-sm text-error">No se pudieron cargar las métricas. {getErrorMessage(loansStatsQuery.error)}</p>
        </div>
      ) : null}

      {loansQuery.isLoading ? (
        <div className="rounded-2xl border border-outline-variant/5 bg-surface-container-low p-8">
          <p className="text-sm text-on-surface-variant">Cargando préstamos…</p>
        </div>
      ) : null}

      {loansQuery.isError ? (
        <div className="rounded-2xl border border-outline-variant/5 bg-surface-container-low p-8">
          <p className="text-sm text-error">{getErrorMessage(loansQuery.error)}</p>
        </div>
      ) : null}

      {loansQuery.data?.data ? (
        <div className="overflow-hidden rounded-2xl border border-outline-variant/5 bg-surface-container-low shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
          {loansQuery.data.total === 0 ? (
            <div className="p-8">
              <p className="text-sm text-on-surface-variant">No hay préstamos registrados.</p>
            </div>
          ) : (
            <>
              <div className="rutapay-table-wrap custom-scrollbar">
                <table className="rutapay-table rutapay-table--responsive">
                  <thead>
                    <tr className="border-b border-outline-variant/10 bg-surface-container-high/50">
                      <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Estado
                      </th>
                      <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Cliente
                      </th>
                      <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Total
                      </th>
                      <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Inicio
                      </th>
                      <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Fin
                      </th>
                      <th className="px-6 py-5 text-right text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {filteredRows.map((loan) => {
                      const clientName =
                        role === "CLIENT"
                          ? clientDisplayNameForClientRole
                          : clientNameById[loan.clientId] ?? (canFetchClientNames ? "…" : "—");
                      const totalTone =
                        loan.status === "DEFAULTED"
                          ? "text-error"
                          : loan.status === "ACTIVE"
                            ? "text-primary"
                            : "text-on-surface-variant";
                      return (
                        <tr key={loan.id} className="group transition-colors hover:bg-surface-bright/30">
                          <td data-label="Estado" className="px-6 py-4">{statusPill(loan.status)}</td>
                          <td data-label="Cliente" className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary-container/30 text-xs font-bold text-primary">
                                {initialsFromName(clientName)}
                              </div>
                              <div>
                                <p className="font-bold text-on-surface">{clientName}</p>
                                <p className="text-[11px] text-on-surface-variant">ID: {loan.clientId.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>
                          <td data-label="Total" className="px-6 py-4">
                            <p className={`font-headline text-sm font-bold ${totalTone}`}>{formatCOP(loan.totalAmount)}</p>
                            <p
                              className={
                                loan.status === "DEFAULTED"
                                  ? "text-[10px] text-error/70"
                                  : "text-[10px] text-on-surface-variant"
                              }
                            >
                              {loan.status === "DEFAULTED"
                                ? "En mora"
                                : loan.status === "COMPLETED"
                                  ? "Pagado"
                                  : `${loan.installmentCount} cuotas`}
                            </p>
                          </td>
                          <td data-label="Inicio" className="px-6 py-4 text-sm text-on-surface-variant">
                            {formatBogotaDateFromString(loan.startDate)}
                          </td>
                          <td data-label="Fin" className="px-6 py-4 text-sm text-on-surface-variant">
                            {formatBogotaDateFromString(loan.endDate)}
                          </td>
                          <td data-no-label="true" data-align="end" className="px-6 py-4 text-right">
                            <Link
                              href={`/loans/${loan.id}`}
                              className="text-xs font-bold text-primary underline decoration-2 underline-offset-4 hover:underline"
                            >
                              Ver plan
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredRows.length === 0 && search.trim() ? (
                <p className="border-t border-outline-variant/10 px-6 py-4 text-sm text-on-surface-variant">
                  Ningún préstamo coincide con la búsqueda (cliente, ID, monto o estado) en esta página.
                </p>
              ) : null}
              <div className="flex flex-col gap-3 border-t border-outline-variant/10 bg-surface-container-high/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-on-surface-variant">
                  Mostrando{" "}
                  <span className="font-bold text-on-surface">
                    {loansQuery.data.total === 0 ? 0 : from}-{to}
                  </span>{" "}
                  de <span className="font-bold text-on-surface">{loansQuery.data.total}</span> préstamos
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-2 flex items-center gap-2 text-xs text-on-surface-variant">
                    <span>Filas</span>
                    <select
                      className="rounded-lg border border-outline-variant/20 bg-surface-container-highest/50 px-2 py-1.5 text-xs text-on-surface"
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value) as PageSize);
                        setPage(1);
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
                    disabled={safePage <= 1}
                    className="rounded-lg bg-surface-container-highest/50 p-2 text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40"
                    onClick={() => setPage(safePage - 1)}
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
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                            item === safePage
                              ? "bg-primary text-on-primary"
                              : "text-on-surface-variant hover:bg-surface-container-highest"
                          }`}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    className="rounded-lg bg-surface-container-highest/50 p-2 text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40"
                    onClick={() => setPage(safePage + 1)}
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
        </div>
      ) : null}

      {role !== "CLIENT" && routesQuery.data?.data && routeSteps.length > 0 ? (
        <div className="rounded-2xl border border-outline-variant/5 bg-surface-container-low p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary" aria-hidden>
                analytics
              </span>
              Resumen de cobro por ruta
            </h3>
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Completado
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-tertiary">
                <span className="h-2 w-2 rounded-full bg-tertiary" />
                En curso
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-error">
                <span className="h-2 w-2 rounded-full bg-error" />
                Alerta
              </span>
            </div>
          </div>
          <div className="relative flex flex-wrap items-start justify-between gap-4 px-4 pt-6 sm:px-10">
            <div className="absolute left-10 right-10 top-[52px] z-0 hidden h-0.5 bg-surface-container-highest sm:block" />
            {routeSteps.map(({ route, variant }) => (
              <div key={route.id} className="relative z-10 flex flex-col items-center gap-2">
                {variant === "done" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_0_15px_rgba(105,246,184,0.4)]">
                    <span className="material-symbols-outlined text-sm" aria-hidden>
                      check
                    </span>
                  </div>
                ) : null}
                {variant === "current" ? (
                  <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-full border-2 border-tertiary bg-surface-container-low text-tertiary shadow-[0_0_20px_rgba(255,177,72,0.2)]">
                    <span className="material-symbols-outlined" aria-hidden>
                      directions_run
                    </span>
                  </div>
                ) : null}
                {variant === "pending" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm" aria-hidden>
                      more_horiz
                    </span>
                  </div>
                ) : null}
                {variant === "alert" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/20 text-error ring-2 ring-error/40">
                    <span className="material-symbols-outlined text-sm" aria-hidden>
                      warning
                    </span>
                  </div>
                ) : null}
                <span
                  className={`max-w-[88px] text-center text-[10px] font-bold ${
                    variant === "current" ? "text-tertiary" : variant === "alert" ? "text-error" : "text-on-surface"
                  }`}
                >
                  {route.name}
                  {variant === "current" ? " (En curso)" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default LoansPage;
