// /frontend/app/(dashboard)/layout/components/CommandPalette.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { formatCOP } from "../../../../lib/formatters";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page?: number;
  limit?: number;
}

interface ClientItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  routeId: string;
  routeName: string;
  managerId: string;
}

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

interface RouteItem {
  id: string;
  name: string;
  managerId: string;
  balance: number;
}

type ResultKind = "cliente" | "préstamo" | "ruta";

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const ClientIcon = (): JSX.Element => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8.5" cy="7" r="4" />
  </svg>
);

const LoanIcon = (): JSX.Element => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 7h8" />
    <path d="M8 11h5" />
    <path d="M8 15h8" />
  </svg>
);

const RouteIcon = (): JSX.Element => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19a2 2 0 0 0 2 2h2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 5h4a2 2 0 0 1 2 2v4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 16 18 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const kindToIcon = (kind: ResultKind): JSX.Element => {
  if (kind === "cliente") return <ClientIcon />;
  if (kind === "préstamo") return <LoanIcon />;
  return <RouteIcon />;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Error desconocido.";
};

export const CommandPalette = ({ open, onClose }: CommandPaletteProps): JSX.Element | null => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canSeeClients = role !== "CLIENT";
  const canSeeRoutes = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";

  const clientsQuery = useQuery({
    queryKey: ["command-clients"],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients");
      return response.data;
    },
    enabled: open && canSeeClients
  });

  const loansQuery = useQuery({
    queryKey: ["command-loans"],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans");
      return response.data;
    },
    enabled: open
  });

  const routesQuery = useQuery({
    queryKey: ["command-routes"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      if (role === "ROUTE_MANAGER") {
        const response = await api.get<ListResponse<RouteItem>>("/routes/me");
        return response.data;
      }
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: open && canSeeRoutes
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const out: SearchResult[] = [];

    const clients = clientsQuery.data?.data ?? [];
    for (const c of clients) {
      const hay = `${c.name} ${c.email} ${c.phone ?? ""} ${c.routeName} ${c.id}`.toLowerCase();
      if (!hay.includes(q)) continue;
      out.push({
        kind: "cliente",
        id: c.id,
        title: c.name,
        subtitle: `${c.routeName} • ${c.email}`,
        href: `/clients/${c.id}`
      });
    }

    const loans = loansQuery.data?.data ?? [];
    for (const l of loans) {
      const hay = `${l.id} ${l.clientId} ${l.status}`.toLowerCase();
      if (!hay.includes(q)) continue;
      out.push({
        kind: "préstamo",
        id: l.id,
        title: `Préstamo ${l.id.slice(0, 8)}`,
        subtitle: `Estado: ${l.status} • Cliente: ${l.clientId.slice(0, 8)}`,
        href: `/loans/${l.id}`
      });
    }

    const routes = routesQuery.data?.data ?? [];
    for (const r of routes) {
      const hay = `${r.id} ${r.name} ${r.managerId}`.toLowerCase();
      if (!hay.includes(q)) continue;
      out.push({
        kind: "ruta",
        id: r.id,
        title: r.name,
        subtitle: `Manager: ${r.managerId.slice(0, 8)} • ${formatCOP(r.balance)}`,
        href: `/routes/${r.id}`
      });
    }

    return out.slice(0, 12);
  }, [clientsQuery.data, loansQuery.data, routesQuery.data, query]);

  useEffect(() => {
    if (!open) return;
    if (results.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((prev) => Math.min(prev, results.length - 1));
  }, [results.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = results[activeIndex];
        if (item) {
          onClose();
          router.push(item.href);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, onClose, open, results, router]);

  if (!open) return null;

  const anyLoading = clientsQuery.isLoading || loansQuery.isLoading || routesQuery.isLoading;
  const anyError = clientsQuery.isError || loansQuery.isError || routesQuery.isError;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      <div
        className={[
          "relative mx-auto w-full max-w-2xl",
          "bottom-0 rounded-t-2xl bg-surface/70 p-4 backdrop-blur",
          "md:top-[10vh] md:bottom-auto md:rounded-2xl md:p-5",
          "md:fixed md:left-1/2 md:-translate-x-1/2 md:w-[680px]"
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2">
            <span className="text-sm text-textSecondary" aria-hidden="true">
              /
            </span>
          </div>
          <div className="flex-1">
            <label className="sr-only" htmlFor="command-search">
              Buscar
            </label>
            <input
              id="command-search"
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe para buscar..."
              className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-textPrimary outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2"
            aria-label="Cerrar búsqueda"
          >
            <span aria-hidden="true" className="text-textSecondary">
              ✕
            </span>
          </button>
        </div>

        <div className="mt-4">
          {anyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : null}

          {anyError ? (
            <div className="rounded-xl bg-bg/70 p-4 backdrop-blur">
              <p className="text-sm font-semibold text-danger">No pudimos buscar ahora.</p>
              <p className="mt-1 text-xs text-textSecondary">Intenta nuevamente.</p>
            </div>
          ) : null}

          {!anyLoading && !anyError ? (
            <>
              {results.length === 0 ? (
                <div className="rounded-xl bg-bg/70 p-5 backdrop-blur">
                  <p className="text-sm font-semibold text-textPrimary">Sin resultados</p>
                  <p className="mt-1 text-xs text-textSecondary">
                    Prueba con un nombre, cédula parcial o ID.
                  </p>
                </div>
              ) : (
                <ul className="max-h-[52vh] overflow-auto pr-1">
                  {results.map((item, idx) => {
                    const isActive = idx === activeIndex;
                    return (
                      <li key={`${item.kind}-${item.id}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            onClose();
                            router.push(item.href);
                          }}
                          className={[
                            "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                            isActive ? "border-primary/40 bg-primary/10" : "border-border bg-transparent hover:bg-surface-2"
                          ].join(" ")}
                        >
                          <span className={isActive ? "text-primary" : "text-textSecondary"}>
                            {kindToIcon(item.kind)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-textPrimary">{item.title}</span>
                            <span className="block truncate text-xs text-textSecondary">{item.subtitle}</span>
                          </span>
                          <span className="text-xs font-semibold text-textSecondary">{item.kind}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

