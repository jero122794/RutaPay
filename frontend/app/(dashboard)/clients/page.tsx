// frontend/app/(dashboard)/clients/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import axios from "axios";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import api from "../../../lib/api";
import { formatCOP } from "../../../lib/formatters";
import { formatBogotaDateFromString } from "../../../lib/bogota";

const WIDE_LIMIT = 2000;

interface ClientItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  documentId: string | null;
  isActive: boolean;
  routeId: string;
  routeName: string;
  managerId: string;
  managerName: string;
}

interface LoanItem {
  id: string;
  clientId: string;
  principal: number;
  installmentAmount: number;
  totalAmount: number;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  createdAt: string;
}

interface PaymentItem {
  id: string;
  loanId: string;
  clientId: string;
  amount: number;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  createdAt: string;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

type AccountFilter = "all" | "active" | "late" | "finished";

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const a = parts[0][0] ?? "";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
};

const frequencyShort = (f: LoanItem["frequency"]): string => {
  switch (f) {
    case "DAILY":
      return "diaria";
    case "WEEKLY":
      return "semanal";
    case "BIWEEKLY":
      return "quincenal";
    case "MONTHLY":
      return "mensual";
    default:
      return f;
  }
};

type RowCategory = "late" | "current" | "finished";

const categoryForClient = (loans: LoanItem[]): RowCategory => {
  if (loans.some((l) => l.status === "DEFAULTED")) {
    return "late";
  }
  if (loans.some((l) => l.status === "ACTIVE")) {
    return "current";
  }
  return "finished";
};

const pickPrimaryLoan = (loans: LoanItem[]): LoanItem | null => {
  const active = loans.find((l) => l.status === "ACTIVE");
  if (active) {
    return active;
  }
  const def = loans.find((l) => l.status === "DEFAULTED");
  if (def) {
    return def;
  }
  const hist = [...loans].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return hist[0] ?? null;
};

const ClientsPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [routeFilter, setRouteFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [search, setSearch] = useState("");

  const clientsQuery = useQuery({
    queryKey: ["clients-list", 1, WIDE_LIMIT],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients", {
        params: { page: 1, limit: WIDE_LIMIT }
      });
      return response.data;
    },
    enabled: role !== "CLIENT"
  });

  const loansQuery = useQuery({
    queryKey: ["loans-wide", 1, WIDE_LIMIT],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans", {
        params: { page: 1, limit: WIDE_LIMIT }
      });
      return response.data;
    },
    enabled: role !== "CLIENT"
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments-wide", 1, 500],
    queryFn: async (): Promise<ListResponse<PaymentItem>> => {
      const response = await api.get<ListResponse<PaymentItem>>("/payments", {
        params: { page: 1, limit: 500 }
      });
      return response.data;
    },
    enabled: role !== "CLIENT"
  });

  const loansByClientId = useMemo(() => {
    const map = new Map<string, LoanItem[]>();
    for (const loan of loansQuery.data?.data ?? []) {
      const list = map.get(loan.clientId) ?? [];
      list.push(loan);
      map.set(loan.clientId, list);
    }
    return map;
  }, [loansQuery.data]);

  const lastPaymentByClientId = useMemo(() => {
    const map = new Map<string, PaymentItem>();
    const rows = paymentsQuery.data?.data ?? [];
    const sorted = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    for (const p of sorted) {
      if (p.status !== "ACTIVE") {
        continue;
      }
      if (!map.has(p.clientId)) {
        map.set(p.clientId, p);
      }
    }
    return map;
  }, [paymentsQuery.data]);

  const routeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientsQuery.data?.data ?? []) {
      map.set(c.routeId, c.routeName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clientsQuery.data]);

  const filteredClients = useMemo(() => {
    const all = clientsQuery.data?.data ?? [];
    const q = search.trim().toLowerCase();

    return all.filter((c) => {
      if (routeFilter && c.routeId !== routeFilter) {
        return false;
      }
      const loans = loansByClientId.get(c.id) ?? [];
      const cat = categoryForClient(loans);
      if (accountFilter === "active" && cat !== "current") {
        return false;
      }
      if (accountFilter === "late" && cat !== "late") {
        return false;
      }
      if (accountFilter === "finished" && cat !== "finished") {
        return false;
      }
      if (q) {
        const doc = (c.documentId ?? "").toLowerCase();
        const name = c.name.toLowerCase();
        const route = c.routeName.toLowerCase();
        if (!name.includes(q) && !doc.includes(q) && !route.includes(q) && !c.id.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [clientsQuery.data, loansByClientId, routeFilter, accountFilter, search]);

  const statsClients = useMemo(() => {
    const all = clientsQuery.data?.data ?? [];
    return all.filter((c) => {
      if (routeFilter && c.routeId !== routeFilter) {
        return false;
      }
      const loans = loansByClientId.get(c.id) ?? [];
      const cat = categoryForClient(loans);
      if (accountFilter === "active" && cat !== "current") {
        return false;
      }
      if (accountFilter === "late" && cat !== "late") {
        return false;
      }
      if (accountFilter === "finished" && cat !== "finished") {
        return false;
      }
      return true;
    });
  }, [clientsQuery.data, loansByClientId, routeFilter, accountFilter]);

  const portfolioStats = useMemo(() => {
    let totalPrincipal = 0;
    const clientIds = new Set(statsClients.map((c) => c.id));
    const clientsWithActiveLoan = new Set<string>();
    let currentClients = 0;
    for (const loan of loansQuery.data?.data ?? []) {
      if (!clientIds.has(loan.clientId)) {
        continue;
      }
      if (loan.status === "ACTIVE") {
        totalPrincipal += loan.principal;
        clientsWithActiveLoan.add(loan.clientId);
      }
    }
    for (const cid of clientsWithActiveLoan) {
      const loans = loansByClientId.get(cid) ?? [];
      if (!loans.some((l) => l.status === "DEFAULTED")) {
        currentClients += 1;
      }
    }
    const withActive = clientsWithActiveLoan.size;
    const pct =
      withActive > 0 ? Math.min(100, Math.round((currentClients / withActive) * 100)) : 0;
    return { totalPrincipal, pct, withActive };
  }, [loansQuery.data, statsClients, loansByClientId]);

  const managerAvatars = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of statsClients) {
      if (c.managerName) {
        m.set(c.managerId, c.managerName);
      }
    }
    return Array.from(m.values());
  }, [statsClients]);

  const totalFiltered = filteredClients.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const sliceStart = (safePage - 1) * limit;
  const pageRows = filteredClients.slice(sliceStart, sliceStart + limit);

  const visiblePageNumbers = useMemo((): number[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, safePage - 2);
    let end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    const out: number[] = [];
    for (let i = start; i <= end; i += 1) {
      out.push(i);
    }
    return out;
  }, [totalPages, safePage]);

  const formatLastPaymentLine = (clientId: string): { main: string; sub: string; subClass: string } => {
    const p = lastPaymentByClientId.get(clientId);
    if (!p) {
      return { main: "—", sub: "Sin pagos registrados", subClass: "text-on-surface-variant" };
    }
    const loans = loansByClientId.get(clientId) ?? [];
    const cat = categoryForClient(loans);
    const rel = formatDistanceToNow(parseISO(p.createdAt), { addSuffix: true, locale: es });
    const main = formatBogotaDateFromString(p.createdAt);
    if (cat === "late") {
      return { main, sub: rel, subClass: "text-error font-bold" };
    }
    return { main, sub: "Al día", subClass: "text-primary font-bold" };
  };

  const statusBadge = (cat: RowCategory, isActive: boolean): JSX.Element => {
    if (!isActive) {
      return (
        <span className="rounded-full bg-surface-container-highest px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          Inactivo
        </span>
      );
    }
    if (cat === "late") {
      return (
        <span className="rounded-full border border-error/10 bg-error-container/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-error">
          En mora
        </span>
      );
    }
    if (cat === "current") {
      return (
        <span className="rounded-full border border-primary/10 bg-primary-container/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
          Al día
        </span>
      );
    }
    return (
      <span className="rounded-full bg-surface-container-highest px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        Cerrado
      </span>
    );
  };

  return (
    <section className="relative space-y-8 pb-28">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
              Cartera de clientes
            </h1>
            <p className="mt-2 font-inter text-sm text-on-surface-variant">
              {clientsQuery.data
                ? `Gestiona ${clientsQuery.data.total} cliente${clientsQuery.data.total === 1 ? "" : "s"} en tus rutas.`
                : "Lista y seguimiento de prestatarios."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canCreate ? (
              <>
                <Link
                  href="/loans/new"
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container px-6 py-3 text-sm font-bold text-on-primary shadow-lg shadow-primary/10 transition-all hover:brightness-110 active:scale-95"
                >
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    add
                  </span>
                  Nuevo préstamo
                </Link>
                <Link
                  href="/clients/new"
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-high px-5 py-3 text-sm font-bold text-on-surface transition-colors hover:bg-surface-bright"
                >
                  Nuevo cliente
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Por ruta
            </label>
            <select
              className="border-none bg-transparent p-0 text-sm font-bold text-on-surface focus:ring-0"
              value={routeFilter}
              onChange={(e) => {
                setRouteFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las rutas</option>
              {routeOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Estado de cuenta
            </label>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <select
                className="w-full border-none bg-transparent p-0 text-sm font-bold text-on-surface focus:ring-0"
                value={accountFilter}
                onChange={(e) => {
                  setAccountFilter(e.target.value as AccountFilter);
                  setPage(1);
                }}
              >
                <option value="all">Todos</option>
                <option value="active">Solo al día</option>
                <option value="late">En mora</option>
                <option value="finished">Cerrados / sin activo</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl bg-surface-container-high/50 p-4 md:col-span-2 md:flex-row md:items-center">
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col">
                <span className="text-xs text-on-surface-variant">Cartera activa (principal)</span>
                <span className="font-headline text-xl font-bold text-primary">
                  {loansQuery.isLoading ? "…" : formatCOP(portfolioStats.totalPrincipal)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-on-surface-variant">% préstamos al día</span>
                <span className="font-headline text-xl font-bold text-tertiary">
                  {loansQuery.isLoading ? "…" : `${portfolioStats.pct}%`}
                </span>
              </div>
            </div>
            <div className="mt-4 flex -space-x-2 md:mt-0">
              {managerAvatars.slice(0, 3).map((name, i) => (
                <div
                  key={`${name}-${i}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface-container-high bg-surface-bright text-[10px] font-bold text-on-surface"
                  title={name}
                >
                  {initialsFromName(name)}
                </div>
              ))}
              {managerAvatars.length > 3 ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface-container-high bg-surface-bright text-[10px] font-bold">
                  +{managerAvatars.length - 3}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">
            search
          </span>
          <input
            type="search"
            placeholder="Buscar por nombre, documento o ruta…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border-none bg-surface-container-lowest py-2.5 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {role === "CLIENT" ? (
        <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <p className="text-sm text-danger">No tienes permisos para ver la lista de clientes.</p>
        </div>
      ) : null}

      {clientsQuery.isLoading ? (
        <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <p className="text-sm text-on-surface-variant">Cargando clientes…</p>
        </div>
      ) : null}

      {clientsQuery.isError ? (
        <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <p className="text-sm text-danger">{getErrorMessage(clientsQuery.error)}</p>
        </div>
      ) : null}

      {!clientsQuery.isLoading && !clientsQuery.isError && clientsQuery.data ? (
        <>
          {totalFiltered === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-surface-container-low p-8 text-center">
              <p className="text-sm text-on-surface-variant">No hay clientes con estos filtros.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <div className="rutapay-table-wrap overflow-hidden rounded-3xl">
                  <div className="overflow-x-auto">
                    <table className="rutapay-table rutapay-table--responsive">
                      <thead>
                        <tr>
                          <th>Perfil</th>
                          <th>Ruta</th>
                          <th>Último pago</th>
                          <th className="text-right">Saldo / cuota</th>
                          <th className="text-center">Estado</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((client) => {
                          const loans = loansByClientId.get(client.id) ?? [];
                          const cat = categoryForClient(loans);
                          const primary = pickPrimaryLoan(loans);
                          const payLine = formatLastPaymentLine(client.id);
                          const canPay = Boolean(primary && primary.status === "ACTIVE");
                          const rowMuted =
                            cat === "finished" && !client.isActive ? "opacity-60 grayscale-[0.25]" : "";
                          return (
                            <tr key={client.id} className={rowMuted}>
                              <td data-label="Perfil">
                                <div className="flex items-center gap-4">
                                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-container-highest font-bold text-on-surface">
                                    {initialsFromName(client.name)}
                                    {cat === "late" ? (
                                      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-surface bg-error" />
                                    ) : cat === "current" ? (
                                      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
                                    ) : null}
                                  </div>
                                  <div className="flex min-w-0 flex-col">
                                    <span className="font-bold text-on-surface">{client.name}</span>
                                    <span className="text-xs text-on-surface-variant">
                                      ID: {client.documentId ?? "—"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Ruta">
                                <div className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-highest px-3 py-1">
                                  <span className="material-symbols-outlined text-xs text-secondary">route</span>
                                  <span className="text-xs font-semibold text-on-surface">{client.routeName}</span>
                                </div>
                              </td>
                              <td data-label="Último pago">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-on-surface">{payLine.main}</span>
                                  <span className={`text-[10px] ${payLine.subClass}`}>{payLine.sub}</span>
                                </div>
                              </td>
                              <td data-label="Saldo / cuota" className="text-right">
                                {primary && primary.status === "ACTIVE" ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-on-surface">
                                      {formatCOP(primary.totalAmount)}
                                    </span>
                                    <span className="text-[10px] text-on-surface-variant">
                                      Cuota {formatCOP(primary.installmentAmount)} · {frequencyShort(primary.frequency)}
                                    </span>
                                  </div>
                                ) : primary && primary.status === "DEFAULTED" ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-on-surface">
                                      {formatCOP(primary.totalAmount)}
                                    </span>
                                    <span className="text-[10px] text-error">Préstamo en mora</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-end">
                                    <span className="text-on-surface-variant">—</span>
                                    <span className="text-[10px] text-on-surface-variant">Sin préstamo activo</span>
                                  </div>
                                )}
                              </td>
                              <td data-label="Estado">
                                <div className="flex justify-center">{statusBadge(cat, client.isActive)}</div>
                              </td>
                              <td data-no-label="true" data-align="end">
                                <div className="flex items-center justify-end gap-2">
                                  <Link
                                    href={`/clients/${client.id}`}
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-highest text-on-surface-variant transition-all hover:bg-primary/10 hover:text-primary active:scale-90"
                                    title="Ver perfil"
                                  >
                                    <span className="material-symbols-outlined">visibility</span>
                                  </Link>
                                  {canPay && primary ? (
                                    <Link
                                      href={`/loans/${primary.id}`}
                                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-lg shadow-primary/20 transition-all hover:brightness-110 active:scale-90"
                                      title="Ir al préstamo"
                                    >
                                      <span className="material-symbols-outlined">payments</span>
                                    </Link>
                                  ) : (
                                    <span
                                      className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl bg-outline-variant/20 text-on-surface-variant/30"
                                      title="Sin préstamo activo"
                                    >
                                      <span className="material-symbols-outlined">payments</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="rutapay-table-footer">
                    <span className="text-on-surface-variant">
                      Mostrando {totalFiltered === 0 ? 0 : sliceStart + 1}–
                      {Math.min(sliceStart + limit, totalFiltered)} de {totalFiltered} clientes
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="mr-2 flex items-center gap-2 text-on-surface-variant">
                        <span className="text-xs">Filas</span>
                        <select
                          className="rounded-lg border border-white/10 bg-surface-container-high px-2 py-1 text-xs text-on-surface"
                          value={limit}
                          onChange={(e) => {
                            setLimit(Number(e.target.value) as PageSize);
                            setPage(1);
                          }}
                        >
                          {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setPage(safePage - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                      </button>
                      {visiblePageNumbers.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPage(n)}
                          className={`flex h-8 min-w-[2rem] items-center justify-center rounded-lg text-xs font-bold ${
                            n === safePage
                              ? "bg-primary/20 text-primary"
                              : "bg-surface-container-high text-on-surface-variant hover:text-primary"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage(safePage + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant transition-colors hover:text-primary disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {pageRows.map((client) => {
                  const loans = loansByClientId.get(client.id) ?? [];
                  const cat = categoryForClient(loans);
                  const primary = pickPrimaryLoan(loans);
                  const payLine = formatLastPaymentLine(client.id);
                  const canPay = Boolean(primary && primary.status === "ACTIVE");
                  return (
                    <div
                      key={client.id}
                      className="rounded-2xl border border-white/5 bg-surface-container-low p-4 shadow-lg"
                    >
                      <div className="flex gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest font-bold">
                          {initialsFromName(client.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-on-surface">{client.name}</p>
                          <p className="text-xs text-on-surface-variant">ID: {client.documentId ?? "—"}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {statusBadge(cat, client.isActive)}
                            <span className="rounded-lg bg-surface-container-highest px-2 py-0.5 text-[10px] text-on-surface">
                              {client.routeName}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-on-surface-variant">Último pago</p>
                          <p className="font-medium text-on-surface">{payLine.main}</p>
                          <p className={payLine.subClass}>{payLine.sub}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-on-surface-variant">Préstamo</p>
                          <p className="font-bold text-on-surface">
                            {primary && (primary.status === "ACTIVE" || primary.status === "DEFAULTED")
                              ? formatCOP(primary.totalAmount)
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link
                          href={`/clients/${client.id}`}
                          className="flex-1 rounded-xl bg-surface-container-high py-2 text-center text-sm font-bold text-on-surface"
                        >
                          Ver perfil
                        </Link>
                        {canPay && primary ? (
                          <Link
                            href={`/loans/${primary.id}`}
                            className="flex-1 rounded-xl bg-primary py-2 text-center text-sm font-bold text-on-primary"
                          >
                            Préstamo
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>
                    Pág. {safePage}/{totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                      className="rounded-lg bg-surface-container-high px-3 py-1 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                      className="rounded-lg bg-surface-container-high px-3 py-1 disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      {canCreate ? (
        <Link
          href="/clients/new"
          className="group fixed bottom-8 right-8 z-50 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-2xl shadow-primary/40 transition-all hover:scale-105 active:scale-95"
          title="Añadir cliente"
        >
          <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            person_add
          </span>
          <span className="pointer-events-none absolute right-full mr-4 whitespace-nowrap rounded-xl border border-outline-variant/10 bg-surface-bright px-4 py-2 text-xs font-bold opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
            Añadir cliente
          </span>
        </Link>
      ) : null}
    </section>
  );
};

export default ClientsPage;
