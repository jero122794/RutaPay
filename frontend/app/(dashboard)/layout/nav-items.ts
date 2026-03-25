// /frontend/app/(dashboard)/layout/nav-items.ts
import type { AppModuleKey, UserRole } from "../../../store/authStore";

export type NavIconKey =
  | "home"
  | "routes"
  | "clients"
  | "loans"
  | "payments"
  | "treasury"
  | "alerts"
  | "users";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconKey;
  module: AppModuleKey;
}

export const filterNavByModules = (items: NavItem[], modules: AppModuleKey[] | undefined): NavItem[] => {
  if (!modules || modules.length === 0) {
    return items;
  }
  return items.filter((item) => modules.includes(item.module));
};

export const navItemsByRole: Record<UserRole, NavItem[]> = {
  SUPER_ADMIN: [
    { label: "Inicio", href: "/overview", icon: "home", module: "OVERVIEW" },
    { label: "Negocios", href: "/businesses", icon: "routes", module: "BUSINESSES" },
    { label: "Módulos por rol", href: "/settings/role-modules", icon: "users", module: "ROLE_MODULES" },
    { label: "Usuarios", href: "/users", icon: "users", module: "USERS" },
    { label: "Rutas", href: "/routes", icon: "routes", module: "ROUTES" },
    { label: "Préstamos", href: "/loans", icon: "loans", module: "LOANS" },
    { label: "Pagos", href: "/payments", icon: "payments", module: "PAYMENTS" },
    { label: "Tesorería", href: "/treasury", icon: "treasury", module: "TREASURY" },
    { label: "Alertas", href: "/notifications", icon: "alerts", module: "NOTIFICATIONS" }
  ],
  ADMIN: [
    { label: "Inicio", href: "/overview", icon: "home", module: "OVERVIEW" },
    { label: "Rutas", href: "/routes", icon: "routes", module: "ROUTES" },
    { label: "Clientes", href: "/clients", icon: "clients", module: "CLIENTS" },
    { label: "Préstamos", href: "/loans", icon: "loans", module: "LOANS" },
    { label: "Pagos", href: "/payments", icon: "payments", module: "PAYMENTS" },
    { label: "Tesorería", href: "/treasury", icon: "treasury", module: "TREASURY" },
    { label: "Usuarios", href: "/users", icon: "users", module: "USERS" },
    { label: "Alertas", href: "/notifications", icon: "alerts", module: "NOTIFICATIONS" }
  ],
  ROUTE_MANAGER: [
    { label: "Inicio", href: "/overview", icon: "home", module: "OVERVIEW" },
    { label: "Clientes", href: "/clients", icon: "clients", module: "CLIENTS" },
    { label: "Préstamos", href: "/loans", icon: "loans", module: "LOANS" },
    { label: "Pagos", href: "/payments", icon: "payments", module: "PAYMENTS" },
    { label: "Tesorería", href: "/treasury", icon: "treasury", module: "TREASURY" },
    { label: "Alertas", href: "/notifications", icon: "alerts", module: "NOTIFICATIONS" }
  ],
  CLIENT: [
    { label: "Inicio", href: "/overview", icon: "home", module: "OVERVIEW" },
    { label: "Mis préstamos", href: "/loans", icon: "loans", module: "LOANS" },
    { label: "Mis pagos", href: "/payments", icon: "payments", module: "PAYMENTS" },
    { label: "Alertas", href: "/notifications", icon: "alerts", module: "NOTIFICATIONS" }
  ]
};

export const isNavItemActive = (pathname: string, href: string): boolean => {
  if (href === "/overview") {
    return pathname === "/overview";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};
