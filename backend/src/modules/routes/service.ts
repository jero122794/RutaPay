// backend/src/modules/routes/service.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma.js";
import type { AddBalanceInput, CreateRouteInput, UpdateRouteInput } from "./schema.js";

interface RouteView {
  id: string;
  name: string;
  managerId: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RouteSummary {
  route: RouteView;
  clientsCount: number;
  activeLoans: number;
  portfolioTotal: number;
  overdueInstallments: number;
}

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const routeViewById = async (id: string): Promise<RouteView> => {
  const route = await prisma.route.findUnique({
    where: { id }
  });

  if (!route) {
    throw new Error("Route not found.");
  }

  return {
    id: route.id,
    name: route.name,
    managerId: route.managerId,
    balance: decimalToNumber(route.balance),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt
  };
};

const ensureManagerRole = async (managerId: string): Promise<void> => {
  const managerRole = await prisma.userRole.findFirst({
    where: {
      userId: managerId,
      role: {
        name: "ROUTE_MANAGER"
      }
    }
  });

  if (!managerRole) {
    throw new Error("Assigned manager must have ROUTE_MANAGER role.");
  }
};

export const listRoutes = async (): Promise<RouteView[]> => {
  const routes = await prisma.route.findMany({
    orderBy: { createdAt: "desc" }
  });

  return routes.map((route) => ({
    id: route.id,
    name: route.name,
    managerId: route.managerId,
    balance: decimalToNumber(route.balance),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt
  }));
};

export const listRoutesByManagerId = async (managerId: string): Promise<RouteView[]> => {
  const routes = await prisma.route.findMany({
    where: { managerId },
    orderBy: { createdAt: "desc" }
  });

  return routes.map((route) => ({
    id: route.id,
    name: route.name,
    managerId: route.managerId,
    balance: decimalToNumber(route.balance),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt
  }));
};

export const createRoute = async (input: CreateRouteInput): Promise<RouteView> => {
  await ensureManagerRole(input.managerId);

  const created = await prisma.route.create({
    data: {
      name: input.name,
      managerId: input.managerId
    }
  });

  return routeViewById(created.id);
};

export const getRouteById = async (
  id: string,
  actorId: string,
  actorRoles: string[]
): Promise<RouteView> => {
  const route = await routeViewById(id);
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const isRouteManagerOwner = actorRoles.includes("ROUTE_MANAGER") && route.managerId === actorId;

  if (!isPrivileged && !isRouteManagerOwner) {
    throw new Error("You do not have access to this route.");
  }

  return route;
};

export const updateRoute = async (id: string, input: UpdateRouteInput): Promise<RouteView> => {
  if (input.managerId) {
    await ensureManagerRole(input.managerId);
  }

  await prisma.route.update({
    where: { id },
    data: {
      name: input.name,
      managerId: input.managerId
    }
  });

  return routeViewById(id);
};

export const addBalanceToRoute = async (
  routeId: string,
  input: AddBalanceInput,
  createdById: string
): Promise<RouteView> => {
  await prisma.$transaction(async (tx) => {
    await tx.route.update({
      where: { id: routeId },
      data: {
        balance: {
          increment: input.amount
        }
      }
    });

    await tx.managerBalanceLog.create({
      data: {
        routeId,
        amount: input.amount,
        type: "CREDIT",
        reference: input.reference,
        createdById
      }
    });
  });

  return routeViewById(routeId);
};

export const getRouteSummary = async (routeId: string): Promise<RouteSummary> => {
  const route = await routeViewById(routeId);

  const [clientsCount, activeLoans, portfolioAgg, overdueInstallments] = await Promise.all([
    prisma.routeClient.count({ where: { routeId } }),
    prisma.loan.count({ where: { routeId, status: "ACTIVE" } }),
    prisma.loan.aggregate({
      _sum: {
        totalAmount: true
      },
      where: {
        routeId,
        status: "ACTIVE"
      }
    }),
    prisma.paymentSchedule.count({
      where: {
        loan: { routeId },
        status: "OVERDUE"
      }
    })
  ]);

  return {
    route,
    clientsCount,
    activeLoans,
    portfolioTotal: portfolioAgg._sum.totalAmount ? Number(portfolioAgg._sum.totalAmount.toString()) : 0,
    overdueInstallments
  };
};
