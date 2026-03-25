// /frontend/app/(dashboard)/layout/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { NavIcon } from "./nav-icons";
import { filterNavByModules, isNavItemActive, navItemsByRole, type NavItem } from "./nav-items";

const BottomNav = (): JSX.Element => {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const modules = user?.modules;

  const items = useMemo<NavItem[]>(() => {
    const list = filterNavByModules(navItemsByRole[role] ?? [], modules);
    return list.filter((item) => item.href !== "/notifications");
  }, [role, modules]);

  return (
    <nav
      className={[
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-surface md:hidden",
        "pb-[env(safe-area-inset-bottom)]"
      ].join(" ")}
    >
      <ul className="flex w-full items-stretch justify-between gap-0 px-0.5">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={[
                  "flex min-h-[2.875rem] flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-center",
                  "text-[9px] font-semibold leading-[1.1]",
                  active ? "text-primary" : "text-textSecondary",
                  "select-none"
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <span className={active ? "text-primary" : "text-slate-400"}>
                  <NavIcon icon={item.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="line-clamp-2 w-full px-0.5">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default BottomNav;
