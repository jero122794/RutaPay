// backend/src/modules/businesses/service.ts
import type { RoleName } from "@prisma/client";
import type { FastifyError } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";

/** Align Route.businessId and CLIENT users for routes tied to this manager. */
const syncManagedRoutesAndTheirClients = async (businessId: string, managerUserId: string): Promise<void> => {
  await prisma.route.updateMany({
    where: { managerId: managerUserId },
    data: { businessId }
  });
  const routes = await prisma.route.findMany({
    where: { managerId: managerUserId },
    select: { id: true }
  });
  if (routes.length === 0) {
    return;
  }
  await syncClientUsersForRoutes(businessId, routes.map((r) => r.id));
};

/** Set businessId on CLIENT users linked to these routes (via RouteClient). */
const syncClientUsersForRoutes = async (businessId: string, routeIds: string[]): Promise<void> => {
  if (routeIds.length === 0) {
    return;
  }
  const rc = await prisma.routeClient.findMany({
    where: { routeId: { in: routeIds } },
    select: { clientId: true }
  });
  const clientIds = [...new Set(rc.map((r) => r.clientId))];
  if (clientIds.length === 0) {
    return;
  }
  const clientRole = await prisma.role.findUnique({ where: { name: "CLIENT" } });
  if (!clientRole) {
    return;
  }
  const withClientRole = await prisma.userRole.findMany({
    where: { roleId: clientRole.id, userId: { in: clientIds } },
    select: { userId: true }
  });
  const userIds = withClientRole.map((u) => u.userId);
  if (userIds.length === 0) {
    return;
  }
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { businessId }
  });
};

/**
 * When a CLIENT is assigned to a business, align routes whose manager already belongs
 * to the same business, then cascade client users on those routes.
 */
const syncRoutesForClientMember = async (businessId: string, clientUserId: string): Promise<void> => {
  const links = await prisma.routeClient.findMany({
    where: { clientId: clientUserId },
    include: {
      route: {
        include: {
          manager: { select: { businessId: true } }
        }
      }
    }
  });
  const routeIds: string[] = [];
  for (const link of links) {
    if (link.route.manager.businessId === businessId) {
      await prisma.route.update({
        where: { id: link.route.id },
        data: { businessId }
      });
      routeIds.push(link.route.id);
    }
  }
  if (routeIds.length > 0) {
    await syncClientUsersForRoutes(businessId, routeIds);
  }
};
import type {
  AssignBusinessMemberInput,
  CreateBusinessInput,
  CreateFirstBusinessAdminInput,
  SetBusinessLicenseInput,
  UpdateBusinessInput
} from "./schema.js";

const TENANT_ROLES: RoleName[] = ["ADMIN", "ROUTE_MANAGER", "CLIENT"];

export interface BusinessView {
  id: string;
  name: string;
  licenseStartsAt: Date | null;
  licenseEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessMemberView {
  userId: string;
  name: string;
  email: string | null;
  roles: RoleName[];
}

export interface BusinessDetailView extends BusinessView {
  members: BusinessMemberView[];
}

export interface AssignableUserView {
  id: string;
  name: string;
  email: string | null;
  businessId: string | null;
  businessName: string | null;
  roles: RoleName[];
}

const toView = (row: {
  id: string;
  name: string;
  licenseStartsAt: Date | null;
  licenseEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BusinessView => ({
  id: row.id,
  name: row.name,
  licenseStartsAt: row.licenseStartsAt,
  licenseEndsAt: row.licenseEndsAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const listBusinesses = async (): Promise<BusinessView[]> => {
  const rows = await prisma.business.findMany({
    orderBy: { name: "asc" }
  });
  return rows.map(toView);
};

export const getBusinessById = async (id: string): Promise<BusinessDetailView> => {
  const business = await prisma.business.findUnique({
    where: { id }
  });

  if (!business) {
    throw new Error("Business not found.");
  }

  const users = await prisma.user.findMany({
    where: { businessId: id },
    include: {
      roles: {
        include: { role: true }
      }
    },
    orderBy: { name: "asc" }
  });

  const members: BusinessMemberView[] = users.map((u) => ({
    userId: u.id,
    name: u.name,
    email: u.email,
    roles: u.roles
      .map((r) => r.role.name)
      .filter((n): n is RoleName => TENANT_ROLES.includes(n as RoleName))
  }));

  return {
    ...toView(business),
    members
  };
};

export const listAssignableUsers = async (): Promise<AssignableUserView[]> => {
  const users = await prisma.user.findMany({
    where: {
      NOT: {
        roles: {
          some: {
            role: { name: "SUPER_ADMIN" }
          }
        }
      }
    },
    include: {
      roles: { include: { role: true } },
      business: { select: { name: true } }
    },
    orderBy: { name: "asc" }
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    businessId: u.businessId,
    businessName: u.business?.name ?? null,
    roles: u.roles.map((r) => r.role.name)
  }));
};

export const createBusiness = async (input: CreateBusinessInput): Promise<BusinessView> => {
  const created = await prisma.business.create({
    data: { name: input.name }
  });
  return toView(created);
};

export const updateBusiness = async (id: string, input: UpdateBusinessInput): Promise<BusinessView> => {
  const exists = await prisma.business.findUnique({ where: { id } });
  if (!exists) {
    throw new Error("Business not found.");
  }
  const updated = await prisma.business.update({
    where: { id },
    data: { name: input.name }
  });
  return toView(updated);
};

const addMonths = (base: Date, months: number): Date => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
};

const addYears = (base: Date, years: number): Date => {
  const d = new Date(base);
  d.setFullYear(d.getFullYear() + years);
  return d;
};

export const setBusinessLicense = async (id: string, input: SetBusinessLicenseInput): Promise<BusinessView> => {
  const exists = await prisma.business.findUnique({
    where: { id },
    select: { id: true, licenseEndsAt: true }
  });
  if (!exists) {
    throw new Error("Business not found.");
  }

  const now = new Date();
  const base = exists.licenseEndsAt && exists.licenseEndsAt.getTime() > now.getTime() ? exists.licenseEndsAt : now;

  const nextEndsAt =
    typeof input.months === "number"
      ? addMonths(base, input.months)
      : typeof input.years === "number"
        ? addYears(base, input.years)
        : null;

  if (!nextEndsAt) {
    throw new Error("Invalid license duration.");
  }

  const updated = await prisma.business.update({
    where: { id },
    data: {
      licenseStartsAt: now,
      licenseEndsAt: nextEndsAt
    }
  });

  return toView(updated);
};

const badRequest = (message: string): FastifyError => {
  const err = new Error(message) as FastifyError;
  err.statusCode = 400;
  err.name = "Bad Request";
  return err;
};

const notFound = (message: string): FastifyError => {
  const err = new Error(message) as FastifyError;
  err.statusCode = 404;
  err.name = "Not Found";
  return err;
};

export const createFirstBusinessAdmin = async (
  businessId: string,
  input: CreateFirstBusinessAdminInput
): Promise<BusinessMemberView> => {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw notFound("El negocio no existe.");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: {
      businessId,
      roles: { some: { role: { name: "ADMIN" } } }
    }
  });
  if (existingAdmin) {
    throw badRequest("Este negocio ya tiene un administrador.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const emailTaken = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (emailTaken) {
    throw badRequest("El correo ya está registrado.");
  }

  const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (!adminRole) {
    throw new Error("ADMIN role not found. Run seed first.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const created = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
      businessId,
      roles: {
        create: { roleId: adminRole.id }
      }
    }
  });

  return {
    userId: created.id,
    name: created.name,
    email: created.email,
    roles: ["ADMIN"]
  };
};

export const assignBusinessMember = async (
  businessId: string,
  input: AssignBusinessMemberInput
): Promise<BusinessMemberView> => {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new Error("Business not found.");
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { roles: { include: { role: true } } }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const hasSuperAdmin = user.roles.some((r) => r.role.name === "SUPER_ADMIN");
  if (hasSuperAdmin) {
    throw new Error("Cannot assign a SUPER_ADMIN user to a business.");
  }

  const roleRow = await prisma.role.findUniqueOrThrow({
    where: { name: input.role }
  });

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: user.id } }),
    prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: roleRow.id
      }
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { businessId }
    }),
    prisma.refreshToken.deleteMany({ where: { userId: user.id } })
  ]);

  await syncManagedRoutesAndTheirClients(businessId, user.id);
  if (input.role === "CLIENT") {
    await syncRoutesForClientMember(businessId, user.id);
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    roles: [input.role]
  };
};

export interface ReconcileBusinessScopeResult {
  routesAligned: number;
  clientUsersAligned: number;
}

/**
 * One-off or periodic repair: routes inherit manager's business; CLIENT users on those routes get businessId.
 * Safe to run after deploy to fix rows created before cascade logic existed.
 */
export const reconcileBusinessScope = async (businessId: string): Promise<ReconcileBusinessScopeResult> => {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw notFound("El negocio no existe.");
  }

  const routesResult = await prisma.route.updateMany({
    where: { manager: { businessId: businessId } },
    data: { businessId }
  });

  const routes = await prisma.route.findMany({
    where: { businessId },
    select: { id: true }
  });
  const routeIds = routes.map((r) => r.id);
  if (routeIds.length === 0) {
    return { routesAligned: routesResult.count, clientUsersAligned: 0 };
  }

  const rc = await prisma.routeClient.findMany({
    where: { routeId: { in: routeIds } },
    select: { clientId: true }
  });
  const clientIds = [...new Set(rc.map((r) => r.clientId))];
  const clientRole = await prisma.role.findUnique({ where: { name: "CLIENT" } });
  if (clientIds.length === 0 || !clientRole) {
    return { routesAligned: routesResult.count, clientUsersAligned: 0 };
  }

  const withClientRole = await prisma.userRole.findMany({
    where: { roleId: clientRole.id, userId: { in: clientIds } },
    select: { userId: true }
  });
  const userIds = withClientRole.map((u) => u.userId);
  if (userIds.length === 0) {
    return { routesAligned: routesResult.count, clientUsersAligned: 0 };
  }

  const usersResult = await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { businessId }
  });

  return {
    routesAligned: routesResult.count,
    clientUsersAligned: usersResult.count
  };
};

export const removeBusinessMember = async (businessId: string, userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.businessId !== businessId) {
    throw new Error("User is not a member of this business.");
  }

  const hasSuperAdmin = user.roles.some((r) => r.role.name === "SUPER_ADMIN");
  if (hasSuperAdmin) {
    throw new Error("Cannot remove SUPER_ADMIN from business scope this way.");
  }

  const clientRole = await prisma.role.findUniqueOrThrow({ where: { name: "CLIENT" } });

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.create({
      data: { userId, roleId: clientRole.id }
    }),
    prisma.user.update({
      where: { id: userId },
      data: { businessId: null }
    }),
    prisma.refreshToken.deleteMany({ where: { userId } })
  ]);
};
