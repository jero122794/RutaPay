// backend/src/modules/treasury/service.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma.js";
import type { CreditRouteInput } from "./schema.js";

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

interface RouteBalanceView {
  routeId: string;
  routeName: string;
  managerId: string;
  currentBalance: number;
  totalCredits: number;
  totalDebits: number;
}

interface CreditResult {
  routeId: string;
  updatedBalance: number;
  creditedAmount: number;
}

interface LiquidationView {
  managerId: string;
  routeId: string;
  routeName: string;
  assignedBalance: number;
  currentBalance: number;
  recoveredPayments: number;
  activePortfolio: number;
  amountToReturn: number;
}

const ensureRouteAccess = async (
  routeId: string,
  actorId: string,
  actorRoles: string[]
): Promise<{ id: string; name: string; managerId: string; balance: Prisma.Decimal }> => {
  const route = await prisma.route.findUnique({
    where: { id: routeId }
  });

  if (!route) {
    throw new Error("Route not found.");
  }

  const isAdmin = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const isOwnerManager = actorRoles.includes("ROUTE_MANAGER") && route.managerId === actorId;

  if (!isAdmin && !isOwnerManager) {
    throw new Error("You do not have access to this route.");
  }

  return route;
};

export const getRouteBalance = async (
  routeId: string,
  actorId: string,
  actorRoles: string[]
): Promise<RouteBalanceView> => {
  const route = await ensureRouteAccess(routeId, actorId, actorRoles);

  const [creditsAgg, debitsAgg] = await Promise.all([
    prisma.managerBalanceLog.aggregate({
      _sum: { amount: true },
      where: {
        routeId,
        type: "CREDIT"
      }
    }),
    prisma.managerBalanceLog.aggregate({
      _sum: { amount: true },
      where: {
        routeId,
        type: "DEBIT"
      }
    })
  ]);

  return {
    routeId: route.id,
    routeName: route.name,
    managerId: route.managerId,
    currentBalance: decimalToNumber(route.balance),
    totalCredits: creditsAgg._sum.amount ? decimalToNumber(creditsAgg._sum.amount) : 0,
    totalDebits: debitsAgg._sum.amount ? decimalToNumber(debitsAgg._sum.amount) : 0
  };
};

export const creditRouteBalance = async (
  input: CreditRouteInput,
  createdById: string
): Promise<CreditResult> => {
  const updated = await prisma.$transaction(async (tx) => {
    const route = await tx.route.update({
      where: { id: input.routeId },
      data: {
        balance: { increment: input.amount }
      }
    });

    await tx.managerBalanceLog.create({
      data: {
        routeId: input.routeId,
        amount: input.amount,
        type: "CREDIT",
        reference: input.reference,
        createdById
      }
    });

    return route;
  });

  return {
    routeId: updated.id,
    updatedBalance: decimalToNumber(updated.balance),
    creditedAmount: input.amount
  };
};

export const getManagerLiquidation = async (managerId: string): Promise<LiquidationView> => {
  const routes = await prisma.route.findMany({
    where: { managerId },
    select: { id: true, name: true, balance: true }
  });

  if (routes.length === 0) {
    throw new Error("Manager route not found.");
  }

  const routeIds = routes.map((r) => r.id);
  const firstRoute = routes[0];
  if (!firstRoute) {
    throw new Error("Manager routes lookup failed.");
  }

  const [creditsAgg, debitsAgg, paymentsAgg, activePortfolioAgg] = await Promise.all([
    prisma.managerBalanceLog.aggregate({
      _sum: { amount: true },
      where: {
        routeId: { in: routeIds },
        type: "CREDIT"
      }
    }),
    prisma.managerBalanceLog.aggregate({
      _sum: { amount: true },
      where: {
        routeId: { in: routeIds },
        type: "DEBIT"
      }
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        loan: {
          routeId: { in: routeIds }
        }
      }
    }),
    prisma.loan.aggregate({
      _sum: { totalAmount: true },
      where: {
        routeId: { in: routeIds },
        status: "ACTIVE"
      }
    })
  ]);

  const totalCredits = creditsAgg._sum.amount ? decimalToNumber(creditsAgg._sum.amount) : 0;
  const totalDebits = debitsAgg._sum.amount ? decimalToNumber(debitsAgg._sum.amount) : 0;
  const assignedBalance = totalCredits - totalDebits;
  const recoveredPayments = paymentsAgg._sum.amount ? decimalToNumber(paymentsAgg._sum.amount) : 0;
  const currentBalance = routes.reduce((acc, r) => acc + decimalToNumber(r.balance), 0);
  const activePortfolio = activePortfolioAgg._sum.totalAmount
    ? decimalToNumber(activePortfolioAgg._sum.totalAmount)
    : 0;

  const amountToReturnRaw = recoveredPayments + currentBalance - activePortfolio;
  const amountToReturn = amountToReturnRaw > 0 ? Math.round(amountToReturnRaw) : 0;

  return {
    managerId,
    // keep compatibility with current frontend contract
    routeId: firstRoute.id,
    routeName: firstRoute.name,
    assignedBalance: Math.round(assignedBalance),
    currentBalance: Math.round(currentBalance),
    recoveredPayments: Math.round(recoveredPayments),
    activePortfolio: Math.round(activePortfolio),
    amountToReturn
  };
};
