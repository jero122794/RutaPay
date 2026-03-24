// backend/src/modules/users/service.ts
import type { RoleName } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { PaginationQuery } from "../../shared/pagination.schema.js";
import { prismaPaginationBounds } from "../../shared/pagination.schema.js";
import { prisma } from "../../shared/prisma.js";
import type { AssignRolesInput, CreateUserInput, UpdateUserInput } from "./schema.js";

interface UserView {
  id: string;
  name: string;
  email: string;
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

interface UserListRow {
  id: string;
  name: string;
  email: string;
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

export const listUsers = async (
  pagination: PaginationQuery | null
): Promise<{ data: UserView[]; total: number; page: number; limit: number }> => {
  const total = await prisma.user.count();

  const include = {
    roles: {
      include: { role: true }
    }
  };

  if (!pagination) {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include
    });
    const data = mapUserRows(users);
    return { data, total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include,
    skip,
    take
  });
  return { data: mapUserRows(users), total, page, limit: pagination.limit };
};

export const createUser = async (input: CreateUserInput): Promise<UserView> => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error("Email already exists.");
  }

  const clientRole = await prisma.role.findUnique({ where: { name: "CLIENT" } });
  if (!clientRole) {
    throw new Error("CLIENT role not found.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      roles: {
        create: [{ roleId: clientRole.id }]
      }
    }
  });

  return toUserView(user.id);
};

export const getUserById = async (id: string): Promise<UserView> => {
  return toUserView(id);
};

export const updateUser = async (
  id: string,
  input: UpdateUserInput,
  actorRoles: string[]
): Promise<UserView> => {
  const target = await toUserView(id);
  forbidManagingAdminsByAdmin(actorRoles, target.roles);

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

export const deleteUser = async (id: string, actorId: string, actorRoles: string[]): Promise<void> => {
  if (id === actorId) {
    throw new Error("You cannot delete your own user.");
  }
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
  actorRoles: string[]
): Promise<UserView> => {
  const target = await toUserView(id);
  forbidManagingAdminsByAdmin(actorRoles, target.roles);
  forbidManagingAdminsByAdmin(actorRoles, input.roles);

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
