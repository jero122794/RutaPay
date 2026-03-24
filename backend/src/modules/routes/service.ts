// backend/src/modules/routes/service.ts
import type { Prisma } from "@prisma/client";
import type { PaginationQuery } from "../../shared/pagination.schema.js";
import { prismaPaginationBounds } from "../../shared/pagination.schema.js";
import { prisma } from "../../shared/prisma.js";
import type { AddBalanceInput, CreateRouteInput, UpdateRouteInput } from "./schema.js";

interface RouteView {
  id: string;
  name: string;
  managerId: string;
  managerName: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RouteSummary {
  route: RouteView;
  clientsCount: number;
  activeLoans: number;
  portfolioTotal: number;
  principalLoaned: number;
  projectedInterest: number;
  availableToLend: number;
  overdueInstallments: number;
  payments: {
    id: string;
    clientName: string;
    installmentAmount: number;
    status: "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" | "REGISTERED";
    createdAt: Date;
  }[];
}

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const routeViewById = async (id: string): Promise<RouteView> => {
  const route = await prisma.route.findUnique({
    where: { id },
    include: {
      manager: {
        select: { name: true }
      }
    }
  });

  if (!route) {
    throw new Error("Route not found.");
  }

  return {
    id: route.id,
    name: route.name,
    managerId: route.managerId,
    managerName: route.manager.name,
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

interface RouteListRow {
  id: string;
  name: string;
  managerId: string;
  balance: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
  manager: { name: string };
}

const mapRouteRows = (routes: RouteListRow[]): RouteView[] =>
  routes.map((route) => ({
    id: route.id,
    name: route.name,
    managerId: route.managerId,
    managerName: route.manager.name,
    balance: decimalToNumber(route.balance),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt
  }));

export const listRoutes = async (
  pagination: PaginationQuery | null
): Promise<{ data: RouteView[]; total: number; page: number; limit: number }> => {
  const total = await prisma.route.count();

  if (!pagination) {
    const routes = await prisma.route.findMany({
      include: {
        manager: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    return { data: mapRouteRows(routes), total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const routes = await prisma.route.findMany({
    include: {
      manager: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: "desc" },
    skip,
    take
  });
  return { data: mapRouteRows(routes), total, page, limit: pagination.limit };
};

export const listRoutesByManagerId = async (
  managerId: string,
  pagination: PaginationQuery | null
): Promise<{ data: RouteView[]; total: number; page: number; limit: number }> => {
  const total = await prisma.route.count({ where: { managerId } });

  if (!pagination) {
    const routes = await prisma.route.findMany({
      where: { managerId },
      include: {
        manager: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    return { data: mapRouteRows(routes), total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const routes = await prisma.route.findMany({
    where: { managerId },
    include: {
      manager: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: "desc" },
    skip,
    take
  });
  return { data: mapRouteRows(routes), total, page, limit: pagination.limit };
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

export const getRouteSummary = async (
  routeId: string,
  actorId: string,
  actorRoles: string[]
): Promise<RouteSummary> => {
  const route = await routeViewById(routeId);
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const isRouteManagerOwner = actorRoles.includes("ROUTE_MANAGER") && route.managerId === actorId;
  if (!isPrivileged && !isRouteManagerOwner) {
    throw new Error("You do not have access to this route.");
  }

  const [clientsCount, activeLoans, portfolioAgg, activeLoanAgg, overdueInstallments, payments] =
    await Promise.all([
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
    prisma.loan.aggregate({
      _sum: {
        principal: true,
        totalInterest: true
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
    }),
    prisma.payment.findMany({
      where: {
        loan: { routeId }
      },
      include: {
        loan: {
          select: {
            client: {
              select: { name: true }
            }
          }
        },
        schedule: {
          select: { status: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  const principalLoaned = activeLoanAgg._sum.principal
    ? Number(activeLoanAgg._sum.principal.toString())
    : 0;
  const projectedInterest = activeLoanAgg._sum.totalInterest
    ? Number(activeLoanAgg._sum.totalInterest.toString())
    : 0;
  const availableToLend = Math.max(route.balance - principalLoaned, 0);

  return {
    route,
    clientsCount,
    activeLoans,
    portfolioTotal: portfolioAgg._sum.totalAmount ? Number(portfolioAgg._sum.totalAmount.toString()) : 0,
    principalLoaned,
    projectedInterest,
    availableToLend,
    overdueInstallments,
    payments: payments.map((payment) => ({
      id: payment.id,
      clientName: payment.loan.client.name,
      installmentAmount: Number(payment.amount.toString()),
      status: payment.schedule?.status ?? "REGISTERED",
      createdAt: payment.createdAt
    }))
  };
};
