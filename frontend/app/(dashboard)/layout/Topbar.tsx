// /frontend/app/(dashboard)/layout/Topbar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { setAccessToken } from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { CommandPalette } from "./components/CommandPalette";

interface TopbarProps {
  onOpenSidebar: () => void;
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
  return "Ruut";
};

export const Topbar = ({ onOpenSidebar }: TopbarProps): JSX.Element => {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));

  const [isOnline, setIsOnline] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [paletteShortcutLabel, setPaletteShortcutLabel] = useState("Ctrl K");

  useEffect(() => {
    setHasMounted(true);
    const platform = typeof navigator !== "undefined" ? navigator.platform : "";
    if (platform.toLowerCase().includes("mac")) {
      setPaletteShortcutLabel("⌘K");
    }
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

  const onLogout = (): void => {
    void (async (): Promise<void> => {
      try {
        await api.post("/auth/logout", {});
      } catch {
        // Session may already be invalid; still clear client state.
      }
      setAccessToken("");
      queryClient.clear();
      clearUser();
      setMobileMenuOpen(false);
      router.push("/login");
    })();
  };

  const notificationsBtnClass = (opts: { compact?: boolean } = {}): string => {
    const base = opts.compact ? "relative inline-flex h-10 w-10" : "relative inline-flex h-11 w-11";
    return [
      base,
      "shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/5 hover:text-emerald-300 active:scale-95",
      pathname.startsWith("/notifications") ? "text-emerald-400" : ""
    ].join(" ");
  };

  return (
    <>
      {/* Mobile + tablet: sticky full-width bar */}
      <header className="sticky top-0 z-40 md:hidden">
        {!isOnline ? (
          <div className="flex items-center gap-2 bg-warning-bg px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
            <p className="text-xs font-semibold text-warning">Sin conexión — mostrando datos guardados</p>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-outline-variant/10 bg-background/70 px-4 py-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high"
              aria-label="Abrir menú de usuario"
            >
              <span className="text-sm font-bold text-on-surface">
                {(user?.name ?? "U")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("") || "U"}
              </span>
            </button>
            <p className="truncate font-headline text-lg font-bold text-on-surface">{pageTitle}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link href="/notifications" className={notificationsBtnClass({ compact: true })} aria-label="Ir a alertas">
              <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
                notifications
              </span>
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="shrink-0 rounded-xl border border-outline-variant/30 px-2.5 py-2 text-xs font-bold text-on-surface-variant hover:border-emerald-400/40 hover:text-emerald-300"
            >
              Menú
            </button>
          </div>
        </div>
      </header>

      {/* Mobile user menu */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Cerrar menú"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-outline-variant/20 bg-surface-container-high p-4 shadow-2xl">
            <div className="flex items-center justify-between px-2 pb-3">
              <div className="min-w-0">
                <p className="truncate font-headline text-base font-extrabold text-on-surface">{user?.name ?? "Usuario"}</p>
                <p className="truncate text-xs text-on-surface-variant">{user?.email ?? ""}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest/40 hover:text-on-surface"
                aria-label="Cerrar"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  close
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <Link
                href="/notifications"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between rounded-2xl bg-surface-container-lowest px-4 py-4 text-sm font-semibold text-on-surface"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary" aria-hidden>
                    notifications
                  </span>
                  Alertas
                </span>
                {unreadCount > 0 ? (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-error px-2 text-xs font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>

              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center justify-between rounded-2xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-4 text-sm font-bold text-error"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-error" aria-hidden>
                    logout
                  </span>
                  Cerrar sesión
                </span>
                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop: fixed bar aligned with sidebar */}
      <header className="pointer-events-none fixed left-0 right-0 top-0 z-40 hidden md:block lg:left-64">
        {!isOnline ? (
          <div className="pointer-events-auto flex items-center gap-2 bg-warning-bg px-8 py-2">
            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
            <p className="text-xs font-semibold text-warning">Sin conexión — mostrando datos guardados</p>
          </div>
        ) : null}
        <div className="pointer-events-auto flex h-16 items-center justify-between gap-6 border-b border-outline-variant/10 bg-background/55 px-6 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-white/5 hover:text-emerald-300 active:scale-95 lg:hidden"
              aria-label="Abrir menú"
            >
              <span className="material-symbols-outlined text-[24px] leading-none" aria-hidden>
                menu
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="group relative w-full max-w-md text-left"
            >
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-hover:text-emerald-400">
                search
              </span>
              <span className="block w-full rounded-xl bg-surface-container-lowest py-2.5 pl-10 pr-4 font-inter text-sm text-on-surface shadow-inner ring-1 ring-transparent transition-all hover:ring-emerald-400/20">
                Buscar clientes, préstamos o rutas…
              </span>
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-outline-variant/40 px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant lg:inline">
                {paletteShortcutLabel}
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            <Link href="/notifications" className={notificationsBtnClass()} aria-label="Ir a alertas">
              <span className="material-symbols-outlined text-[24px] leading-none" aria-hidden>
                notifications
              </span>
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-emerald-300 active:scale-95"
              aria-label="Ayuda"
            >
              <span className="material-symbols-outlined text-[24px] leading-none" aria-hidden>
                help_outline
              </span>
            </button>
            <div className="hidden h-8 w-px bg-outline-variant/30 sm:block" />
            <button
              type="button"
              onClick={() => {
                if (roleForUi === "SUPER_ADMIN" || roleForUi === "ADMIN") {
                  router.push("/users");
                }
              }}
              className="flex items-center gap-3 rounded-xl py-1 transition-all active:scale-95"
            >
              <span className="hidden text-sm font-bold text-on-surface sm:inline font-manrope">
                {user?.name ?? "Perfil"}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-surface-container-high text-xs font-bold text-on-surface">
                {(user?.name ?? "U")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("") || "U"}
              </span>
              {(roleForUi === "SUPER_ADMIN" || roleForUi === "ADMIN") ? (
                <span aria-hidden="true" className="text-on-surface-variant">
                  ▾
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
};
