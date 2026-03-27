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
  isTabletExpanded: boolean;
  onCloseTablet: () => void;
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

const Sidebar = ({ isTabletExpanded, onCloseTablet }: SidebarProps): JSX.Element => {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
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
    enabled: Boolean(user)
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
    })();
  };

  const [tabletHoverLock, setTabletHoverLock] = useState(false);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const expanded = isTabletExpanded || tabletHoverLock;

  return (
    <>
      {/* Overlay only in tablet to avoid covering desktop content */}
      {expanded ? (
        <div
          className="fixed inset-0 z-20 hidden bg-background/70 md:block lg:hidden"
          role="presentation"
          onClick={() => {
            setTabletHoverLock(false);
            onCloseTablet();
          }}
        />
      ) : null}

      <aside
        className={[
          "hidden md:flex",
          "flex-col border-r border-white/5 bg-[#0a0f1e]",
          "z-30",
          "transition-[width,transform] duration-200 ease-out",
          expanded ? "md:w-60" : "md:w-16",
          "lg:w-60",
          "md:relative lg:static",
          "translate-x-0"
        ].join(" ")}
        onMouseEnter={() => {
          // Only expand via hover when the sidebar is not locked by click.
          if (!tabletHoverLock) setTabletHoverLock(true);
        }}
        onMouseLeave={() => {
          // Keep it open if it's already expanded via click (prop).
          if (!isTabletExpanded) setTabletHoverLock(false);
        }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`min-w-0 overflow-hidden transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"} lg:opacity-100`}
            >
              <p className="truncate font-headline text-[34px] font-bold tracking-tight text-blue-500">RutaPay</p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <p
            className={`mb-3 text-xs uppercase tracking-wider text-textSecondary transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"} lg:opacity-100`}
          >
            Navegación
          </p>
        </div>

        <nav className="flex-1 px-2">
          <ul className="space-y-1">
            {!hasMounted
              ? Array.from({ length: 8 }).map((_, i) => (
                  <li key={`sidebar-nav-skel-${i}`}>
                    <div
                      className={[
                        "group flex items-center gap-3 rounded-lg px-3 py-3",
                        "min-h-[44px]",
                        expanded ? "justify-start" : "justify-center",
                        "lg:justify-start"
                      ].join(" ")}
                      aria-hidden
                    >
                      <span className="h-5 w-5 shrink-0 rounded bg-slate-700/40" />
                      <span
                        className={[
                          "h-4 max-w-[140px] flex-1 rounded bg-slate-700/30",
                          expanded ? "opacity-100" : "opacity-0",
                          "lg:opacity-100"
                        ].join(" ")}
                      />
                    </div>
                  </li>
                ))
              : navItems.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const showBadge = item.icon === "alerts";
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          // Close overlay on navigation (tablet).
                          setTabletHoverLock(false);
                          onCloseTablet();
                        }}
                        className={[
                          "group flex items-center gap-3 rounded-lg px-3 py-3",
                          "min-h-[44px]",
                          "transition-colors duration-150",
                          active
                            ? "bg-primary/10 text-primary border-r-2 border-primary"
                            : "text-slate-400 hover:bg-white/5 hover:text-on-surface",
                          expanded ? "justify-start" : "justify-center",
                          "lg:justify-start"
                        ].join(" ")}
                      >
                        <span className={active ? "text-primary" : "text-slate-400"}>
                          <NavIcon icon={item.icon} />
                        </span>

                        <span
                          className={[
                            "min-w-0 overflow-hidden whitespace-nowrap transition-opacity duration-150",
                            expanded ? "opacity-100" : "opacity-0",
                            "lg:opacity-100"
                          ].join(" ")}
                        >
                          <span className="text-sm font-medium">{item.label}</span>
                          {showBadge ? (
                            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-error/20 px-2 py-0.5 text-[11px] font-semibold text-error">
                              {unreadCount}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-white/5 p-4">
          {!hasMounted ? (
            <div aria-hidden>
              <div className={`flex items-center gap-3 ${expanded ? "justify-start" : "justify-center"} lg:justify-start`}>
                <div className="h-10 w-10 shrink-0 rounded-full bg-slate-700/40" />
                <div
                  className={`min-w-0 flex-1 space-y-2 transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"} lg:opacity-100`}
                >
                  <div className="h-4 max-w-[160px] rounded bg-slate-700/30" />
                  <div className="h-3 max-w-[100px] rounded bg-slate-700/30" />
                </div>
              </div>
              <div
                className={`mt-3 h-10 rounded-md bg-slate-700/20 ${expanded ? "opacity-100" : "opacity-0"} transition-opacity duration-150 lg:opacity-100`}
              />
            </div>
          ) : (
            <>
              <div className={`flex items-center gap-3 ${expanded ? "justify-start" : "justify-center"} lg:justify-start`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary-container bg-surface-2">
                  <span className="text-sm font-semibold text-textPrimary">
                    {(user?.name ?? "U")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join("") || "U"}
                  </span>
                </div>

                <div
                  className={`min-w-0 overflow-hidden transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"} lg:opacity-100`}
                >
                  <p className="truncate text-sm font-semibold">{user?.name ?? "—"}</p>
                  <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                    {role === "ROUTE_MANAGER"
                      ? "Encargado de Ruta"
                      : role === "SUPER_ADMIN"
                        ? "Super Administrador"
                        : role === "ADMIN"
                          ? "Administrador"
                          : "Cliente"}
                  </p>
                </div>
              </div>

              <div
                className={`mt-3 ${expanded ? "opacity-100" : "opacity-0"} transition-opacity duration-150 lg:opacity-100`}
              >
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center justify-center rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-on-surface hover:bg-white/10"
                >
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

