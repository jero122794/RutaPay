// backend/src/shared/role-modules.ts
import type { AppModule, RoleName } from "@prisma/client";
import { prisma } from "./prisma.js";

export const ALL_APP_MODULES: AppModule[] = [
  "OVERVIEW",
  "ROUTES",
  "CLIENTS",
  "LOANS",
  "PAYMENTS",
  "TREASURY",
  "USERS",
  "NOTIFICATIONS",
  "BUSINESSES",
  "ROLE_MODULES"
];

/** Used when RoleModuleGrant has no rows yet (e.g. migrate without seed). Must match prisma/seed.ts intent. */
const DEFAULT_MODULES_BY_ROLE: Record<Exclude<RoleName, "SUPER_ADMIN">, AppModule[]> = {
  ADMIN: [
    "OVERVIEW",
    "ROUTES",
    "CLIENTS",
    "LOANS",
    "PAYMENTS",
    "TREASURY",
    "NOTIFICATIONS",
    "USERS"
  ],
  ROUTE_MANAGER: ["OVERVIEW", "CLIENTS", "LOANS", "PAYMENTS", "TREASURY", "NOTIFICATIONS"],
  CLIENT: ["OVERVIEW", "LOANS", "PAYMENTS", "NOTIFICATIONS"]
};

export const loadModulesForRoles = async (roles: RoleName[]): Promise<AppModule[]> => {
  if (roles.includes("SUPER_ADMIN")) {
    return [...ALL_APP_MODULES];
  }

  const rows = await prisma.roleModuleGrant.findMany({
    where: { roleName: { in: roles } },
    select: { module: true }
  });

  // Always merge role defaults with DB grants. Partial or wrong rows in production (e.g. only one module
  // inserted) must not leave users without CLIENTS / NOTIFICATIONS / etc.
  const unique = new Set<AppModule>();

  for (const r of roles) {
    if (r === "SUPER_ADMIN") {
      return [...ALL_APP_MODULES];
    }
    const defs = DEFAULT_MODULES_BY_ROLE[r];
    if (defs) {
      defs.forEach((m) => unique.add(m));
    }
  }

  for (const row of rows) {
    unique.add(row.module);
  }

  return Array.from(unique);
};
