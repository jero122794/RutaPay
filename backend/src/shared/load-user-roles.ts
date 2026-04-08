// backend/src/shared/load-user-roles.ts
import type { RoleName } from "@prisma/client";
import { prisma } from "./prisma.js";

export const loadRolesByUserId = async (userId: string): Promise<RoleName[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true }
  });
  return userRoles.map((entry) => entry.role.name);
};
