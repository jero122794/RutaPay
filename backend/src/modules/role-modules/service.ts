// backend/src/modules/role-modules/service.ts
import type { AppModule, RoleName } from "@prisma/client";
import { prisma } from "../../shared/prisma.js";
import { ALL_APP_MODULES } from "../../shared/role-modules.js";
import type { PutRoleModulesInput } from "./schema.js";

const ROLE_NAMES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"];
const MODULE_SET = new Set<string>(ALL_APP_MODULES);

export const getRoleModuleGrants = async (): Promise<Record<RoleName, AppModule[]>> => {
  const rows = await prisma.roleModuleGrant.findMany();
  const map: Record<RoleName, AppModule[]> = {
    SUPER_ADMIN: [],
    ADMIN: [],
    ROUTE_MANAGER: [],
    CLIENT: []
  };
  for (const row of rows) {
    map[row.roleName].push(row.module);
  }
  return map;
};

export const replaceRoleModuleGrants = async (input: PutRoleModulesInput): Promise<void> => {
  const { grants } = input;
  const rows: { roleName: RoleName; module: AppModule }[] = [];

  for (const roleName of ROLE_NAMES) {
    const modules = grants[roleName];
    if (!Array.isArray(modules)) {
      throw new Error(`Missing grants for role ${roleName}.`);
    }
    const seen = new Set<string>();
    for (const mod of modules) {
      if (!MODULE_SET.has(mod)) {
        throw new Error(`Invalid module: ${mod}`);
      }
      if (seen.has(mod)) {
        continue;
      }
      seen.add(mod);
      rows.push({ roleName, module: mod as AppModule });
    }
  }

  await prisma.$transaction([
    prisma.roleModuleGrant.deleteMany(),
    prisma.roleModuleGrant.createMany({ data: rows })
  ]);
};
