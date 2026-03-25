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

export const loadModulesForRoles = async (roles: RoleName[]): Promise<AppModule[]> => {
  if (roles.includes("SUPER_ADMIN")) {
    return [...ALL_APP_MODULES];
  }

  const rows = await prisma.roleModuleGrant.findMany({
    where: { roleName: { in: roles } },
    select: { module: true }
  });

  const unique = new Set(rows.map((row) => row.module));
  return Array.from(unique);
};
