// backend/src/modules/clients/service.ts
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";
import type { CreateClientInput, UpdateClientInput } from "./schema.js";

interface ClientView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  routeId: string;
  routeName: string;
  managerId: string;
  managerName: string;
  createdAt: Date;
  updatedAt: Date;
}

const toClientViewById = async (clientId: string): Promise<ClientView> => {
  const routeClient = await prisma.routeClient.findFirst({
    where: { clientId },
    include: {
      route: true
    }
  });

  const client = await prisma.user.findUnique({
    where: { id: clientId }
  });

  if (!client || !routeClient) {
    throw new Error("Client not found.");
  }

  const managerUser = await prisma.user.findUnique({
    where: { id: routeClient.route.managerId },
    select: { id: true, name: true }
  });

  if (!managerUser) {
    throw new Error("Route manager not found.");
  }

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    isActive: client.isActive,
    routeId: routeClient.routeId,
    routeName: routeClient.route.name,
    managerId: routeClient.route.managerId,
    managerName: managerUser.name,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt
  };
};

const ensureRouteManagerAccess = async (
  routeId: string,
  actorId: string,
  actorRoles: string[]
): Promise<void> => {
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  if (isPrivileged) {
    return;
  }

  const route = await prisma.route.findUnique({
    where: { id: routeId }
  });

  if (!route) {
    throw new Error("Route not found.");
  }

  const isOwnerManager = actorRoles.includes("ROUTE_MANAGER") && route.managerId === actorId;
  if (!isOwnerManager) {
    throw new Error("You do not have access to this route.");
  }
};

export const listClients = async (actorId: string, actorRoles: string[]): Promise<ClientView[]> => {
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");

  const routeFilter = isPrivileged
    ? {}
    : {
        route: {
          managerId: actorId
        }
      };

  const routeClients = await prisma.routeClient.findMany({
    where: routeFilter,
    include: {
      route: true
    },
    orderBy: {
      route: { createdAt: "desc" }
    }
  });

  const clientIds = routeClients.map((item) => item.clientId);
  const managerIds = Array.from(new Set(routeClients.map((item) => item.route.managerId)));
  const users = await prisma.user.findMany({
    where: { id: { in: clientIds } }
  });
  const managerUsers = await prisma.user.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, name: true }
  });

  const userMap = new Map(users.map((user) => [user.id, user]));
  const managerNameById = new Map(managerUsers.map((u) => [u.id, u.name]));

  const clientRole = await prisma.role.findUnique({ where: { name: "CLIENT" } });
  if (!clientRole) {
    return [];
  }

  const clientRoleRows = await prisma.userRole.findMany({
    where: {
      userId: { in: clientIds },
      roleId: clientRole.id
    },
    select: { userId: true }
  });
  const clientUserIds = new Set(clientRoleRows.map((row) => row.userId));

  const result: ClientView[] = [];

  for (const item of routeClients) {
    const client = userMap.get(item.clientId);
    if (!client || !clientUserIds.has(client.id)) {
      continue;
    }
    result.push({
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      isActive: client.isActive,
      routeId: item.routeId,
      routeName: item.route.name,
      managerId: item.route.managerId,
      managerName: managerNameById.get(item.route.managerId) ?? item.route.managerId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt
    });
  }

  return result;
};

export const createClient = async (
  input: CreateClientInput,
  actorId: string,
  actorRoles: string[]
): Promise<ClientView> => {
  await ensureRouteManagerAccess(input.routeId, actorId, actorRoles);

  const existing = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existing) {
    throw new Error("Email already exists.");
  }

  const clientRole = await prisma.role.findUnique({
    where: { name: "CLIENT" }
  });

  if (!clientRole) {
    throw new Error("CLIENT role does not exist.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash
      }
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: clientRole.id
      }
    });

    await tx.routeClient.create({
      data: {
        routeId: input.routeId,
        clientId: user.id
      }
    });

    return user;
  });

  return toClientViewById(created.id);
};

export const getClientById = async (
  id: string,
  actorId: string,
  actorRoles: string[]
): Promise<ClientView> => {
  const client = await toClientViewById(id);
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const isOwnerManager = actorRoles.includes("ROUTE_MANAGER") && client.managerId === actorId;

  if (!isPrivileged && !isOwnerManager) {
    throw new Error("You do not have access to this client.");
  }

  return client;
};

export const updateClient = async (
  id: string,
  input: UpdateClientInput,
  actorId: string,
  actorRoles: string[]
): Promise<ClientView> => {
  const current = await getClientById(id, actorId, actorRoles);

  await prisma.user.update({
    where: { id: current.id },
    data: {
      name: input.name,
      phone: input.phone,
      isActive: input.isActive
    }
  });

  return toClientViewById(current.id);
};
