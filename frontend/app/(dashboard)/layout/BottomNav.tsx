// /frontend/app/(dashboard)/layout/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuthStore, type UserRole } from "../../../store/authStore";

type BottomNavItem = {
  label: string;
  href: string;
};

const bottomItemsByRole: Record<UserRole, BottomNavItem[]> = {
  SUPER_ADMIN: [
    { label: "Inicio", href: "/overview" },
    { label: "Clientes", href: "/clients" },
    { label: "Préstamos", href: "/loans" },
    { label: "Alertas", href: "/notifications" }
  ],
  ADMIN: [
    { label: "Inicio", href: "/overview" },
    { label: "Clientes", href: "/clients" },
    { label: "Préstamos", href: "/loans" },
    { label: "Alertas", href: "/notifications" }
  ],
  ROUTE_MANAGER: [
    { label: "Inicio", href: "/overview" },
    { label: "Clientes", href: "/clients" },
    { label: "Préstamos", href: "/loans" },
    { label: "Alertas", href: "/notifications" }
  ],
  CLIENT: [
    { label: "Inicio", href: "/overview" },
    { label: "Mis préstamos", href: "/loans" },
    { label: "Mis pagos", href: "/payments" },
    { label: "Alertas", href: "/notifications" }
  ]
};

const BottomNav = (): JSX.Element => {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";

  const items = useMemo<BottomNavItem[]>(() => bottomItemsByRole[role] ?? [], [role]);

  return (
    <nav
      className={[
        "fixed inset-x-0 bottom-0 z-40 bg-surface md:hidden",
        "pb-[env(safe-area-inset-bottom)]"
      ].join(" ")}
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={[
                  "flex min-h-16 flex-col items-center justify-center",
                  "gap-1 px-2 text-center text-[11px] font-semibold",
                  active ? "text-primary" : "text-textSecondary",
                    "select-none"
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default BottomNav;

