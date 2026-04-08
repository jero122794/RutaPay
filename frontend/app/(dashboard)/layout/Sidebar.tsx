// /frontend/app/(dashboard)/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { setAccessToken } from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { NavIcon } from "./nav-icons";
import { filterNavByModules, isNavItemActive, navItemsByRole, type NavItem } from "./nav-items";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
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

const roleSubtitle = (role: UserRole): string => {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super admin";
    case "ADMIN":
      return "Administrador";
    case "ROUTE_MANAGER":
      return "Encargado de ruta";
    default:
      return "Cliente";
  }
};

const Sidebar = ({ open, onClose }: SidebarProps): JSX.Element => {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const clearUser = useAuthStore((state) => state.clearUser);

  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const navItems = useMemo<NavItem[]>(() => {
    const base = navItemsByRole[role];
    return filterNavByModules(base, user?.modules);
  }, [role, user?.modules]);

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationsResponse> => {
      const response = await api.get<NotificationsResponse>("/notifications");
      return response.data;
    },
    enabled: Boolean(user) && hasAuthHydrated
  });

  const unreadCount = useMemo((): number => {
    const items = notificationsQuery.data?.data ?? [];
    return items.filter((n) => !n.read).length;
  }, [notificationsQuery.data]);

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
      router.push("/login");
      onClose();
    })();
  };

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const showPaymentsCta = role === "ROUTE_MANAGER" || role === "ADMIN" || role === "SUPER_ADMIN";

  return (
    <>
      {/* Tablet overlay */}
      <div
        className={[
          "fixed inset-0 z-50 hidden md:block lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          "transition-opacity"
        ].join(" ")}
        aria-hidden={!open}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          aria-label="Cerrar menú"
        />
      </div>

      <aside
        className={[
          "fixed left-0 top-0 z-[60] h-screen w-64 flex-col",
          "border-r-0 bg-background/75 py-6 pl-4 pr-3 backdrop-blur-xl",
          "shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)]",
          "hidden",
          "md:flex lg:flex",
          "md:translate-x-[-105%] md:transition-transform md:duration-200 md:ease-out",
          open ? "md:translate-x-0" : "",
          "lg:translate-x-0"
        ].join(" ")}
      >
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center">
            <img src="/brand/ruut_logo_1.svg" alt="Ruut" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-black tracking-tighter text-emerald-400">Ruut</h1>
            <p className="min-h-[1rem] font-inter text-xs text-on-surface-variant">
              {hasMounted ? roleSubtitle(role) : "\u00a0"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-white/5 hover:text-emerald-300 lg:hidden"
            aria-label="Cerrar menú"
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              close
            </span>
          </button>
        </div>

        <p className="mb-3 px-2 text-xs uppercase tracking-wider text-on-surface-variant">Navegación</p>

        <nav className="flex-1 space-y-1 overflow-y-auto hide-scrollbar pr-1">
          {!hasMounted
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={`sidebar-nav-skel-${i}`} className="flex items-center gap-3 rounded-xl px-4 py-3">
                  <span className="h-6 w-6 rounded bg-white/10" />
                  <span className="h-4 flex-1 rounded bg-white/[0.08]" />
                </div>
              ))
            : navItems.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                const showBadge = item.icon === "alerts";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onClose()}
                    className={[
                      "flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-3 font-inter transition-all duration-200",
                      active
                        ? "border-r-4 border-emerald-400 bg-emerald-400/10 font-bold text-emerald-400"
                        : "text-on-surface-variant hover:bg-white/[0.06] hover:text-emerald-300"
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <NavIcon icon={item.icon} filled={active} className="text-[22px] leading-none" />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                    {showBadge && unreadCount > 0 ? (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-error/25 px-1.5 text-[10px] font-bold text-error">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
        </nav>

        <div className="mt-4 space-y-3 border-t border-outline-variant/20 pt-4">
          {hasMounted && showPaymentsCta ? (
            <Link
              href="/payments"
              onClick={() => onClose()}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-container py-3.5 font-bold text-on-primary shadow-lg shadow-primary/10 transition-all hover:opacity-90 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
                add_circle
              </span>
              Nuevo cobro
            </Link>
          ) : null}

          {hasMounted ? (
            <>
              <div className="flex items-center gap-3 px-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-surface-container-high text-sm font-bold text-on-surface">
                  {(user?.name ?? "U")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("") || "U"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">{user?.name ?? "—"}</p>
                  <p className="min-h-[0.875rem] truncate text-[10px] uppercase tracking-wider text-on-surface-variant">
                    {hasMounted ? roleSubtitle(role) : "\u00a0"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-xl border border-outline-variant/30 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:text-emerald-300"
              >
                Cerrar sesión
              </button>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
