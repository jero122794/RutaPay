// /frontend/app/(dashboard)/layout/nav-items.ts
import type { UserRole } from "../../../store/authStore";

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
}

export const navItemsByRole: Record<UserRole, NavItem[]> = {
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
    { label: "Tesorería", href: "/treasury", icon: "treasury" },
    { label: "Alertas", href: "/notifications", icon: "alerts" }
  ],
  CLIENT: [
    { label: "Inicio", href: "/overview", icon: "home" },
    { label: "Mis préstamos", href: "/loans", icon: "loans" },
    { label: "Mis pagos", href: "/payments", icon: "payments" },
    { label: "Alertas", href: "/notifications", icon: "alerts" }
  ]
};

export const isNavItemActive = (pathname: string, href: string): boolean => {
  if (href === "/overview") {
    return pathname === "/overview";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};
