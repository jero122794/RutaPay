// /frontend/app/(dashboard)/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { useAuthStore, type UserRole } from "../../../store/authStore";

type NavItem = {
  label: string;
  href: string;
  icon: "home" | "routes" | "clients" | "loans" | "payments" | "treasury" | "alerts" | "users";
};

const itemsByRole: Record<UserRole, NavItem[]> = {
  SUPER_ADMIN: [
    { label: "Inicio", href: "/overview", icon: "home" },
    { label: "Usuarios", href: "/users", icon: "users" },
    { label: "Rutas", href: "/routes", icon: "routes" },
    { label: "Préstamos", href: "/loans", icon: "loans" },
    { label: "Pagos", href: "/payments", icon: "payments" },
    { label: "Tesorería", href: "/treasury", icon: "treasury" },
    { label: "Alertas", href: "/notifications", icon: "alerts" }
  ],
  ADMIN: [
    { label: "Inicio", href: "/overview", icon: "home" },
    { label: "Rutas", href: "/routes", icon: "routes" },
    { label: "Clientes", href: "/clients", icon: "clients" },
    { label: "Préstamos", href: "/loans", icon: "loans" },
    { label: "Pagos", href: "/payments", icon: "payments" },
    { label: "Tesorería", href: "/treasury", icon: "treasury" },
    { label: "Alertas", href: "/notifications", icon: "alerts" }
  ],
  ROUTE_MANAGER: [
    { label: "Inicio", href: "/overview", icon: "home" },
    { label: "Clientes", href: "/clients", icon: "clients" },
    { label: "Préstamos", href: "/loans", icon: "loans" },
    { label: "Pagos", href: "/payments", icon: "payments" },
    { label: "Alertas", href: "/notifications", icon: "alerts" }
  ],
  CLIENT: [
    { label: "Inicio", href: "/overview", icon: "home" },
    { label: "Mis préstamos", href: "/loans", icon: "loans" },
    { label: "Mis pagos", href: "/payments", icon: "payments" },
    { label: "Alertas", href: "/notifications", icon: "alerts" }
  ]
};

const NotificationIcon = (): JSX.Element => {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
};

const NavIcon = ({ icon }: { icon: NavItem["icon"] }): JSX.Element => {
  const common = "h-5 w-5";
  switch (icon) {
    case "home":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "routes":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19a2 2 0 0 0 2 2h2" />
          <path d="M14 5h4a2 2 0 0 1 2 2v4" />
          <path d="M6 16 18 4" />
          <path d="M16 8h4v4" />
          <circle cx="7" cy="17" r="1" />
        </svg>
      );
    case "clients":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </svg>
      );
    case "loans":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 11h5" />
          <path d="M8 15h8" />
        </svg>
      );
    case "payments":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10" />
          <path d="M7 13h6" />
        </svg>
      );
    case "treasury":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1v22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H7" />
        </svg>
      );
    case "users":
      return (
        <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </svg>
      );
    case "alerts":
      return <NotificationIcon />;
  }
};

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
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);

  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const navItems = useMemo<NavItem[]>(() => itemsByRole[role], [role]);

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
    clearUser();
    router.push("/login");
  };

  const [tabletHoverLock, setTabletHoverLock] = useState(false);

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
            {navItems.map((item) => {
              const active = pathname === item.href;
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
              <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">{role === "ROUTE_MANAGER" ? "Encargado de Ruta" : role === "SUPER_ADMIN" ? "Super Administrador" : role === "ADMIN" ? "Administrador" : "Cliente"}</p>
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
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

