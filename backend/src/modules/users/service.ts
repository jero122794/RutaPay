// backend/src/modules/users/service.ts
import type { Prisma, RoleName } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { PaginationQuery } from "../../shared/pagination.schema.js";
import { prismaPaginationBounds } from "../../shared/pagination.schema.js";
import { prisma } from "../../shared/prisma.js";
import type { AssignRolesInput, CreateUserInput, UpdateUserInput } from "./schema.js";

interface UserView {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: RoleName[];
}

const toUserView = async (userId: string): Promise<UserView> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: { role: true }
      }
    }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles.map((entry) => entry.role.name)
  };
};

const forbidManagingAdminsByAdmin = (
  actorRoles: string[],
  targetRoles: string[] | RoleName[]
): void => {
  const actorIsAdmin = actorRoles.includes("ADMIN");
  const actorIsSuperAdmin = actorRoles.includes("SUPER_ADMIN");
  const targetIsPrivileged = targetRoles.includes("ADMIN") || targetRoles.includes("SUPER_ADMIN");

  if (actorIsAdmin && !actorIsSuperAdmin && targetIsPrivileged) {
    throw new Error("ADMIN cannot manage ADMIN or SUPER_ADMIN users.");
  }
};

const forbidAssigningSuperAdminWithoutSuperActor = (
  actorRoles: string[],
  requestedRoles: RoleName[]
): void => {
  const actorIsSuperAdmin = actorRoles.includes("SUPER_ADMIN");
  if (!actorIsSuperAdmin && requestedRoles.includes("SUPER_ADMIN")) {
    throw new Error("Only SUPER_ADMIN can assign the SUPER_ADMIN role.");
  }
};

const forbidAssigningAdminWithoutSuperActor = (
  actorRoles: string[],
  requestedRoles: RoleName[]
): void => {
  const actorIsSuperAdmin = actorRoles.includes("SUPER_ADMIN");
  if (!actorIsSuperAdmin && requestedRoles.includes("ADMIN")) {
    throw new Error("Only SUPER_ADMIN can assign the ADMIN role.");
  }
};

const assertAdminBusinessAccess = (
  targetBusinessId: string | null,
  actorRoles: string[],
  actorBusinessId: string | null
): void => {
  const actorIsSuper = actorRoles.includes("SUPER_ADMIN");
  if (actorIsSuper) {
    return;
  }
  const actorIsAdmin = actorRoles.includes("ADMIN");
  if (!actorIsAdmin) {
    throw new Error("You do not have access to this user.");
  }
  if (!actorBusinessId || targetBusinessId !== actorBusinessId) {
    throw new Error("You do not have access to this user.");
  }
};

interface UserListRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: { name: RoleName } }[];
}

const mapUserRows = (users: UserListRow[]): UserView[] =>
  users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles.map((entry) => entry.role.name)
  }));

const userListInclude = {
  roles: {
    include: { role: true }
  }
} satisfies Prisma.UserInclude;

export const listUsers = async (
  actorRoles: string[],
  actorBusinessId: string | null,
  pagination: PaginationQuery | null
): Promise<{ data: UserView[]; total: number; page: number; limit: number }> => {
  const isSuper = actorRoles.includes("SUPER_ADMIN");
  const where: Prisma.UserWhereInput = isSuper
    ? {}
    : actorBusinessId
      ? { businessId: actorBusinessId }
      : { id: { in: [] } };

  const total = await prisma.user.count({ where });

  if (!pagination) {
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: userListInclude
    });
    const data = mapUserRows(users as UserListRow[]);
    return { data, total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: userListInclude,
    skip,
    take
  });
  return { data: mapUserRows(users as UserListRow[]), total, page, limit: pagination.limit };
};

export const createUser = async (
  input: CreateUserInput,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<UserView> => {
  const actorIsSuper = actorRoles.includes("SUPER_ADMIN");
  const actorIsAdmin = actorRoles.includes("ADMIN") && !actorIsSuper;

  if (actorIsAdmin) {
    const invalidRole = input.roles.some((r) => r !== "ROUTE_MANAGER" && r !== "CLIENT");
    if (invalidRole) {
      throw new Error("ADMIN can only create users with ROUTE_MANAGER or CLIENT role.");
    }
  }

  forbidAssigningSuperAdminWithoutSuperActor(actorRoles, input.roles);
  forbidAssigningAdminWithoutSuperActor(actorRoles, input.roles);

  let resolvedBusinessId: string | null = null;
  if (input.roles.includes("SUPER_ADMIN")) {
    if (!actorIsSuper) {
      throw new Error("Only SUPER_ADMIN can create SUPER_ADMIN users.");
    }
    resolvedBusinessId = null;
  } else if (actorIsSuper) {
    resolvedBusinessId = input.businessId ?? null;
    if (!resolvedBusinessId) {
      throw new Error("businessId is required for tenant users.");
    }
  } else if (actorIsAdmin) {
    resolvedBusinessId = actorBusinessId;
    if (!resolvedBusinessId) {
      throw new Error("Admin must belong to a business.");
    }
  } else {
    throw new Error("Insufficient permissions to create users.");
  }

  const normalizedEmail = input.email?.trim()
    ? input.email.trim().toLowerCase()
    : `${input.documentId!}@empleado.local`;

  const existingByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingByEmail) {
    throw new Error("Email already exists.");
  }

  if (input.documentId) {
    const existingDoc = await prisma.user.findFirst({ where: { documentId: input.documentId } });
    if (existingDoc) {
      throw new Error("Document already exists.");
    }
  }

  const roles = await prisma.role.findMany({
    where: { name: { in: input.roles } }
  });

  if (roles.length !== input.roles.length) {
    throw new Error("Some roles do not exist.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: normalizedEmail,
      phone: input.phone ?? null,
      documentId: input.documentId ?? null,
      passwordHash,
      businessId: resolvedBusinessId,
      roles: {
        create: roles.map((role) => ({ roleId: role.id }))
      }
    }
  });

  return toUserView(user.id);
};

export const getUserById = async (
  id: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<UserView> => {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { businessId: true }
  });
  if (!target) {
    throw new Error("User not found.");
  }
  assertAdminBusinessAccess(target.businessId, actorRoles, actorBusinessId);
  return toUserView(id);
};

export const updateUser = async (
  id: string,
  input: UpdateUserInput,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<UserView> => {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { businessId: true }
  });
  if (!target) {
    throw new Error("User not found.");
  }
  assertAdminBusinessAccess(target.businessId, actorRoles, actorBusinessId);

  const view = await toUserView(id);
  forbidManagingAdminsByAdmin(actorRoles, view.roles);

  await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      isActive: input.isActive
    }
  });

  if (input.isActive !== undefined && input.isActive === false) {
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
  }

  return toUserView(id);
};

export const deleteUser = async (
  id: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<void> => {
  if (id === actorId) {
    throw new Error("You cannot delete your own user.");
  }

  const targetRow = await prisma.user.findUnique({
    where: { id },
    select: { businessId: true }
  });
  if (!targetRow) {
    throw new Error("User not found.");
  }
  assertAdminBusinessAccess(targetRow.businessId, actorRoles, actorBusinessId);

  const target = await toUserView(id);
  forbidManagingAdminsByAdmin(actorRoles, target.roles);

  const [managedRoutesCount, clientLoansCount, managedLoansCount, paymentsCount] = await Promise.all([
    prisma.route.count({ where: { managerId: id } }),
    prisma.loan.count({ where: { clientId: id } }),
    prisma.loan.count({ where: { managerId: id } }),
    prisma.payment.count({ where: { registeredById: id } })
  ]);

  if (
    managedRoutesCount > 0 ||
    clientLoansCount > 0 ||
    managedLoansCount > 0 ||
    paymentsCount > 0
  ) {
    throw new Error(
      "Cannot delete user with financial or route history. Deactivate the user instead."
    );
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.routeClient.deleteMany({ where: { clientId: id } }),
    prisma.pushSubscription.deleteMany({ where: { userId: id } }),
    prisma.refreshToken.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } })
  ]);
};

export const assignRoles = async (
  id: string,
  input: AssignRolesInput,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<UserView> => {
  const targetRow = await prisma.user.findUnique({
    where: { id },
    select: { businessId: true }
  });
  if (!targetRow) {
    throw new Error("User not found.");
  }
  assertAdminBusinessAccess(targetRow.businessId, actorRoles, actorBusinessId);

  const target = await toUserView(id);
  forbidManagingAdminsByAdmin(actorRoles, target.roles);
  forbidManagingAdminsByAdmin(actorRoles, input.roles);
  forbidAssigningSuperAdminWithoutSuperActor(actorRoles, input.roles);
  forbidAssigningAdminWithoutSuperActor(actorRoles, input.roles);

  const roles = await prisma.role.findMany({
    where: {
      name: {
        in: input.roles
      }
    }
  });

  if (roles.length !== input.roles.length) {
    throw new Error("Some roles do not exist.");
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.userRole.createMany({
      data: roles.map((role) => ({
        userId: id,
        roleId: role.id
      }))
    })
  ]);

  await prisma.refreshToken.deleteMany({ where: { userId: id } });

  return toUserView(id);
};
