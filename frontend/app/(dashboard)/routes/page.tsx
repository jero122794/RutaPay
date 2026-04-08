// frontend/app/(dashboard)/routes/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type PageSize } from "../../../lib/page-size";
import api from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatCOP } from "../../../lib/formatters";

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
  createdAt: string;
  updatedAt: string;
}

interface ApiErrorShape {
  message?: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const msg = (error.response?.data as ApiErrorShape | undefined)?.message;
    return msg ?? error.message;
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

const ROW_ICONS = ["explore", "navigation", "location_city", "map"] as const;

type RouteStatusKind = "pending" | "progress" | "liquidation";

const routeStatus = (balance: number, highThreshold: number): RouteStatusKind => {
  if (balance === 0) return "pending";
  if (balance >= highThreshold) return "liquidation";
  return "progress";
};

const statusPill = (kind: RouteStatusKind): JSX.Element => {
  switch (kind) {
    case "pending":
      return (
        <span className="rounded-full border border-outline-variant/20 bg-surface-container-highest px-2.5 py-1 text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant">
          Pendiente inicio
        </span>
      );
    case "progress":
      return (
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-tighter text-primary">
          En progreso
        </span>
      );
    case "liquidation":
      return (
        <span className="rounded-full border border-tertiary/20 bg-tertiary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-tighter text-tertiary">
          Liquidación
        </span>
      );
    default:
      return <span className="text-on-surface-variant">—</span>;
  }
};

const RoutesPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const canView = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";
  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN";
  const routesEndpoint = role === "ROUTE_MANAGER" ? "/routes/me" : "/routes";

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");

  const routesQuery = useQuery({
    queryKey: ["routes-list", role, page, limit],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>(routesEndpoint, {
        params: { page, limit }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && canView
  });

  const routesWideQuery = useQuery({
    queryKey: ["routes-list-wide-stats", routesEndpoint],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>(routesEndpoint);
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && canView
  });

  useEffect(() => {
    const d = routesQuery.data;
    if (!d) return;
    if (d.page !== page) setPage(d.page);
  }, [routesQuery.data, page]);

  const portfolioStats = useMemo(() => {
    const wideRows = routesWideQuery.data?.data ?? [];
    const totalBalance = wideRows.reduce((s, r) => s + r.balance, 0);
    const count = routesWideQuery.data?.total ?? wideRows.length;
    const withBalance = wideRows.filter((r) => r.balance > 0).length;
    const denom = Math.max(1, wideRows.length);
    const efficiency = Math.round((withBalance / denom) * 1000) / 10;
    const balances = wideRows.map((r) => r.balance).filter((b) => b > 0);
    const sorted = [...balances].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianHigh =
      sorted.length === 0 ? 5_000_000 : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const highThreshold = Math.max(5_000_000, Math.round(medianHigh));
    return { totalBalance, count, efficiency, highThreshold };
  }, [routesWideQuery.data]);

  const filteredRows = useMemo(() => {
    const rows = routesQuery.data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        `${r.name} ${r.managerName} ${r.id} ${r.managerId} ${formatCOP(r.balance)}`.toLowerCase().includes(q)
    );
  }, [routesQuery.data, search]);

  const totalPages = Math.max(1, Math.ceil((routesQuery.data?.total ?? 0) / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = routesQuery.data?.total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = routesQuery.data ? Math.min(safePage * limit, routesQuery.data.total) : 0;

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

  if (!canView) {
    return (
      <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
        <h1 className="font-headline text-xl font-semibold text-on-surface">Rutas</h1>
        <p className="mt-2 text-sm text-error">No tienes permisos para ver rutas.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto min-h-screen max-w-7xl space-y-10 bg-background px-4 pb-12 pt-4 selection:bg-primary/30 md:px-8 lg:px-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative w-full max-w-md">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
              search
            </span>
            <input
              className="w-full rounded-full border-none bg-surface-container-lowest py-2 pl-10 pr-4 text-sm text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] placeholder:text-outline/50 focus:ring-2 focus:ring-primary/30"
              placeholder="Buscar rutas, encargados o IDs…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <section className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <nav className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
            <Link href="/overview" className="hover:text-primary">
              Inicio
            </Link>
            <span className="material-symbols-outlined text-[12px]" aria-hidden>
              chevron_right
            </span>
            <span className="text-primary">Rutas</span>
          </nav>
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface md:text-5xl">Rutas</h1>
          <p className="mt-2 max-w-lg text-on-surface-variant">
            Gestiona rutas de cobro, saldos en caja y el ciclo de recaudo por territorio.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/routes/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container px-8 py-4 font-headline font-bold text-on-primary shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)] transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="material-symbols-outlined" aria-hidden>
              add_circle
            </span>
            Crear ruta
          </Link>
        ) : null}
      </section>

      <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/5 bg-surface-container-low p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Total en rutas</p>
          <p className="font-headline text-3xl font-bold text-primary">
            {routesWideQuery.isLoading ? (
              "—"
            ) : (
              <>
                {formatCOP(portfolioStats.totalBalance)}{" "}
                <span className="ml-1 text-sm font-normal text-on-surface-variant">COP</span>
              </>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/5 bg-surface-container-low p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Rutas activas</p>
          <p className="font-headline text-3xl font-bold text-on-surface">
            {routesWideQuery.isLoading ? "—" : portfolioStats.count}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/5 bg-surface-container-low p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Eficiencia (con saldo)
          </p>
          <p className="font-headline text-3xl font-bold text-tertiary">
            {routesWideQuery.isLoading ? "—" : `${portfolioStats.efficiency}%`}
          </p>
        </div>
      </div>

      {routesQuery.isLoading ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-8">
          <p className="text-sm text-on-surface-variant">Cargando rutas…</p>
        </div>
      ) : null}

      {routesQuery.isError ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-8">
          <p className="text-sm text-error">{getErrorMessage(routesQuery.error)}</p>
        </div>
      ) : null}

      {routesQuery.data ? (
        routesQuery.data.total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container-low py-24">
            <span className="material-symbols-outlined mb-4 text-6xl text-outline-variant/30" aria-hidden>
              directions_off
            </span>
            <h3 className="font-headline text-xl font-bold text-on-surface-variant">No hay rutas para mostrar</h3>
            <p className="mb-6 mt-1 text-sm text-on-surface-variant/60">Comienza creando tu primera ruta de recaudo.</p>
            {canCreate ? (
              <Link
                href="/routes/new"
                className="rounded-lg border border-primary/30 bg-primary/10 px-6 py-2 text-sm font-bold text-primary transition-all hover:bg-primary/20"
              >
                Configurar nueva ruta
              </Link>
            ) : null}
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl bg-surface-container-low shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)]">
            <div className="rutapay-table-wrap">
              <table className="rutapay-table rutapay-table--responsive">
                <thead>
                  <tr>
                    <th>Ruta</th>
                    <th>Encargado</th>
                    <th>Balance</th>
                    <th>Estado</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, idx) => {
                    const icon = ROW_ICONS[idx % ROW_ICONS.length];
                    const kind = routeStatus(r.balance, portfolioStats.highThreshold);
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-surface-container-highest/30">
                        <td data-label="Ruta" className="px-6 py-6 md:px-8">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <span className="material-symbols-outlined" aria-hidden>
                                {icon}
                              </span>
                            </div>
                            <div>
                              <p className="font-headline text-base font-bold text-on-surface">{r.name}</p>
                              <p className="text-[11px] text-on-surface-variant">
                                ID: {r.id.length > 14 ? `${r.id.slice(0, 12)}…` : r.id}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td data-label="Encargado" className="px-6 py-6 md:px-8">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-secondary/30 to-primary/20 text-[9px] font-bold text-on-surface">
                              {initialsFromName(r.managerName || "?")}
                            </div>
                            <span className="text-sm font-medium text-on-surface">{r.managerName || "—"}</span>
                          </div>
                        </td>
                        <td data-label="Balance" className="px-6 py-6 md:px-8">
                          <span className="font-headline text-lg font-bold text-primary">{formatCOP(r.balance)}</span>
                        </td>
                        <td data-label="Estado" className="px-6 py-6 md:px-8">{statusPill(kind)}</td>
                        <td data-no-label="true" data-align="end" className="px-6 py-6 text-right md:px-8">
                          <Link
                            href={`/routes/${r.id}`}
                            className="inline-flex items-center gap-1 text-sm font-bold text-primary transition-all hover:underline"
                          >
                            Ver resumen
                            <span className="material-symbols-outlined text-sm" aria-hidden>
                              arrow_forward_ios
                            </span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredRows.length === 0 && search.trim() ? (
              <p className="border-t border-outline-variant/10 px-8 py-4 text-sm text-on-surface-variant">
                Ninguna ruta coincide con la búsqueda en esta página.
              </p>
            ) : null}
            <div className="flex flex-col gap-3 border-t border-outline-variant/10 bg-surface-container-highest/20 px-6 py-4 md:flex-row md:items-center md:justify-between md:px-8">
              <p className="text-xs text-on-surface-variant">
                Mostrando <span className="font-bold text-on-surface">{from}</span>–
                <span className="font-bold text-on-surface">{to}</span> de{" "}
                <span className="font-bold text-on-surface">{routesQuery.data.total}</span> rutas
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
                  className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant transition-all hover:bg-surface-container-highest disabled:opacity-30"
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
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all ${
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
                  className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant transition-all hover:bg-surface-container-highest disabled:opacity-30"
                  onClick={() => setPage(safePage + 1)}
                  aria-label="Siguiente"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden>
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
          </section>
        )
      ) : null}
    </section>
  );
};

export default RoutesPage;
