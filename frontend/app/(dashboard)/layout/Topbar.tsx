// /frontend/app/(dashboard)/layout/Topbar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { CommandPalette } from "./components/CommandPalette";

interface BreadcrumbItem {
  label: string;
}

interface NotificationsResponse {
  data: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
  }>;
  total: number;
}

const getPageTitle = (pathname: string): string => {
  const normalized = pathname.replaceAll("//", "/");
  if (normalized === "/" || normalized === "/overview") return "Inicio";
  if (normalized.startsWith("/clients")) return normalized.endsWith("/new") ? "Nuevo cliente" : "Clientes";
  if (normalized.startsWith("/loans")) return normalized.endsWith("/new") ? "Nuevo préstamo" : "Préstamos";
  if (normalized.startsWith("/payments")) return "Pagos";
  if (normalized.startsWith("/routes")) return normalized.endsWith("/new") ? "Nueva ruta" : "Rutas";
  if (normalized.startsWith("/treasury")) return "Tesorería";
  if (normalized.startsWith("/notifications")) return "Alertas";
  if (normalized.startsWith("/users")) return "Usuarios";
  return "RutaPay";
};

const buildBreadcrumb = (pathname: string): BreadcrumbItem[] => {
  const normalized = pathname.replaceAll("//", "/");
  const segments = normalized.split("/").filter(Boolean);

  const base: BreadcrumbItem[] = [{ label: "Inicio" }];
  if (segments.length === 0) return base;

  // Keep it simple and stable across dynamic id routes.
  const root = segments[0];
  const map: Record<string, string> = {
    clients: "Clientes",
    loans: "Préstamos",
    payments: "Pagos",
    routes: "Rutas",
    treasury: "Tesorería",
    notifications: "Alertas",
    users: "Usuarios",
    overview: "Inicio"
  };

  const crumb1 = map[root] ?? root.charAt(0).toUpperCase() + root.slice(1);
  const crumb: BreadcrumbItem = { label: crumb1 };
  const maybeNew = segments.includes("new") ? { label: "Nuevo" } : segments.includes("edit") ? { label: "Editar" } : null;

  if (!maybeNew) return [base[0], crumb];
  return [base[0], crumb, maybeNew];
};

const BellIcon = (): JSX.Element => {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
};

const MenuIcon = (): JSX.Element => {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  );
};

interface TopbarProps {
  onToggleTabletSidebar: () => void;
}

export const Topbar = ({ onToggleTabletSidebar }: TopbarProps): JSX.Element => {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));

  const [isOnline, setIsOnline] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);
  const roleForUi: UserRole = hasMounted ? role : "CLIENT";

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const onOnline = (): void => setIsOnline(true);
    const onOffline = (): void => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const platform = navigator.platform ?? "";
      const isMac = platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationsResponse> => {
      const response = await api.get<NotificationsResponse>("/notifications");
      return response.data;
    },
    enabled: Boolean(user)
  });

  const unreadCount = useMemo((): number => {
    const items = notificationsQuery.data?.data ?? [];
    return items.filter((n) => !n.read).length;
  }, [notificationsQuery.data]);

  const pageTitle = useMemo((): string => getPageTitle(pathname), [pathname]);
  const breadcrumb = useMemo((): BreadcrumbItem[] => buildBreadcrumb(pathname), [pathname]);

  return (
    <header className="sticky top-0 z-40 relative border-b border-white/5 bg-[#0a0f1e]/70 backdrop-blur-xl">
      {/* Offline banner */}
      {!isOnline ? (
        <div className="flex items-center gap-2 bg-warning-bg px-4 py-2 md:px-5 lg:px-6">
          <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
          <p className="text-xs font-semibold text-warning">Sin conexión — mostrando datos guardados</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-4 py-3 md:px-5 lg:px-8">
        {/* Mobile */}
        <div className="flex min-w-0 items-center gap-3 md:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2">
            <span className="text-sm font-semibold text-textPrimary">
              {(user?.name ?? "U")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join("") || "U"}
            </span>
          </div>

          <div className="min-w-0">
            <p className="truncate font-headline text-lg font-bold text-on-surface">{pageTitle}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/notifications"
              className={[
                "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10",
                pathname.startsWith("/notifications") ? "bg-primary/15 text-primary" : "text-on-surface"
              ].join(" ")}
              aria-label="Ir a alertas"
              aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
            >
              <BellIcon />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>

        {/* Tablet */}
        <div className="hidden w-full items-center justify-between gap-3 md:flex lg:hidden">
          <button
            type="button"
            onClick={onToggleTabletSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Abrir menú"
          >
            <MenuIcon />
          </button>

          <nav className="min-w-0 flex-1">
            <p className="truncate font-headline text-base font-bold text-on-surface">{breadcrumb.map((b) => b.label).join(" > ")}</p>
            <p className="mt-1 text-xs text-textSecondary">RutaPay</p>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className={[
                "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10",
                pathname.startsWith("/notifications") ? "bg-primary/15 text-primary" : "text-on-surface"
              ].join(" ")}
              aria-label="Ir a alertas"
              aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
            >
              <BellIcon />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={() => {
                if (roleForUi === "SUPER_ADMIN" || roleForUi === "ADMIN") {
                  router.push("/users");
                }
              }}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2"
            >
              <span className="text-sm font-semibold text-textPrimary">
                {roleForUi === "SUPER_ADMIN" ? "Super" : roleForUi === "ADMIN" ? "Admin" : roleForUi === "ROUTE_MANAGER" ? "Encargado" : "Cliente"}
              </span>
              {(roleForUi === "SUPER_ADMIN" || roleForUi === "ADMIN") ? (
                <span aria-hidden="true" className="text-textSecondary">
                  ▾
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden w-full items-center gap-4 md:flex lg:flex">
          <nav className="min-w-0 flex-1">
            <p className="truncate font-headline text-xl font-bold text-on-surface">{breadcrumb.map((b) => b.label).join(" > ")}</p>
            <p className="mt-1 text-xs text-textSecondary">{pageTitle}</p>
          </nav>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden w-[520px] max-w-[55vw] items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left lg:flex hover:bg-white/10"
          >
            <span className="text-sm text-textSecondary">Buscar en clientes, préstamos y rutas</span>
            <span className="ml-auto rounded-md border border-border px-2 py-1 text-xs text-textSecondary">
              Ctrl K
            </span>
          </button>

          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className={[
                "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10",
                pathname.startsWith("/notifications") ? "bg-primary/15 text-primary" : "text-on-surface"
              ].join(" ")}
              aria-label="Ir a alertas"
              aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
            >
              <BellIcon />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={() => {
                if (roleForUi === "SUPER_ADMIN" || roleForUi === "ADMIN") {
                  router.push("/users");
                }
              }}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2 hover:bg-white/10"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2">
                <span className="text-sm font-semibold text-textPrimary">
                  {(user?.name ?? "U")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("") || "U"}
                </span>
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-sm font-semibold text-textPrimary">{user?.name ?? "Usuario"}</p>
                <p className="truncate text-xs text-textSecondary">
                  {roleForUi === "SUPER_ADMIN"
                    ? "Super Admin"
                    : roleForUi === "ADMIN"
                      ? "Admin"
                      : roleForUi === "ROUTE_MANAGER"
                        ? "Encargado de Ruta"
                        : "Cliente"}
                </p>
              </div>
              {(roleForUi === "SUPER_ADMIN" || roleForUi === "ADMIN") ? (
                <span aria-hidden="true" className="text-textSecondary">
                  ▾
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
};

