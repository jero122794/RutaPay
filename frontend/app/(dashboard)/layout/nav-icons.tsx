// /frontend/app/(dashboard)/layout/nav-icons.tsx
import type { NavIconKey } from "./nav-items";

/** Material Symbols names aligned with dashboard reference UI */
const MATERIAL_MAP: Record<NavIconKey, string> = {
  home: "dashboard",
  routes: "route",
  clients: "group",
  loans: "payments",
  payments: "receipt_long",
  treasury: "account_balance",
  alerts: "notifications",
  users: "manage_accounts"
};

interface NavIconProps {
  icon: NavIconKey;
  className?: string;
  filled?: boolean;
}

export const NavIcon = ({ icon, className = "text-[24px] leading-none", filled = false }: NavIconProps): JSX.Element => {
  const symbol = MATERIAL_MAP[icon];
  return (
    <span
      className={["material-symbols-outlined select-none", className].filter(Boolean).join(" ")}
      style={
        filled
          ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
          : { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
      }
      aria-hidden
    >
      {symbol}
    </span>
  );
};
