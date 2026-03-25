// backend/src/modules/treasury/service.ts
import type { Frequency, LiquidationReviewStatus, Prisma } from "@prisma/client";
import { bogotaDayBoundsUtc, getBogotaTodayYmd } from "../../shared/bogota-day.js";
import { prisma } from "../../shared/prisma.js";
import { sanitizePlainText } from "../../shared/sanitize.js";
import { slicePage } from "../../shared/pagination.schema.js";
import type { CreditRouteInput } from "./schema.js";

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

export const assertManagerInBusinessScope = async (
  managerId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<void> => {
  if (actorRoles.includes("SUPER_ADMIN")) {
    return;
  }
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
    select: { businessId: true }
  });
  if (!actorBusinessId || !manager || manager.businessId !== actorBusinessId) {
    throw new Error("You do not have access to this manager.");
  }
};

const FREQUENCIES: Frequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"];

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

export interface LiquidationView {
  managerId: string;
  routeId: string;
  routeName: string;
  assignedBalance: number;
  currentBalance: number;
  recoveredPayments: number;
  activePortfolio: number;
  amountToReturn: number;
}

export interface LiquidationRouteBreakdown {
  routeId: string;
  routeName: string;
  cashInRoute: number;
  activePortfolio: number;
  collectedOnDate: number;
  lentPrincipalOnDate: number;
  overdueInstallmentsOutstanding: number;
}

export interface LiquidationFrequencyBreakdown {
  frequency: Frequency;
  label: string;
  collectedOnDate: number;
  lentPrincipalOnDate: number;
  activeLoansCount: number;
  overdueInstallmentsOutstanding: number;
}

export interface LiquidationDetailView extends LiquidationView {
  asOfDate: string;
  totalsOnDate: {
    collected: number;
    lentPrincipal: number;
  };
  byRoute: LiquidationRouteBreakdown[];
  byFrequency: LiquidationFrequencyBreakdown[];
}

const frequencyLabel = (f: Frequency): string => {
  switch (f) {
    case "DAILY":
      return "Diaria";
    case "WEEKLY":
      return "Semanal";
    case "BIWEEKLY":
      return "Quincenal";
    case "MONTHLY":
      return "Mensual";
    default:
      return f;
  }
};

const ensureRouteAccess = async (
  routeId: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<{ id: string; name: string; managerId: string; balance: Prisma.Decimal }> => {
  const route = await prisma.route.findUnique({
    where: { id: routeId }
  });

  if (!route) {
    throw new Error("Route not found.");
  }

  const isSuper = actorRoles.includes("SUPER_ADMIN");
  const isAdmin = actorRoles.includes("ADMIN") && !isSuper;
  const isOwnerManager = actorRoles.includes("ROUTE_MANAGER") && route.managerId === actorId;

  if (isAdmin) {
    if (!actorBusinessId || route.businessId !== actorBusinessId) {
      throw new Error("You do not have access to this route.");
    }
  } else if (!isSuper && !isOwnerManager) {
    throw new Error("You do not have access to this route.");
  }

  return route;
};

export const getRouteBalance = async (
  routeId: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<RouteBalanceView> => {
  const route = await ensureRouteAccess(routeId, actorId, actorRoles, actorBusinessId);

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
  createdById: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<CreditResult> => {
  await ensureRouteAccess(input.routeId, createdById, actorRoles, actorBusinessId);
  const reference = sanitizePlainText(input.reference);
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
        reference: reference ?? null,
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

const buildLiquidationBase = async (managerId: string): Promise<LiquidationView> => {
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
        status: "ACTIVE",
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
    routeId: firstRoute.id,
    routeName: firstRoute.name,
    assignedBalance: Math.round(assignedBalance),
    currentBalance: Math.round(currentBalance),
    recoveredPayments: Math.round(recoveredPayments),
    activePortfolio: Math.round(activePortfolio),
    amountToReturn
  };
};

export const getManagerLiquidation = async (managerId: string): Promise<LiquidationView> => {
  return buildLiquidationBase(managerId);
};

const overdueOutstandingForLoanIds = async (loanIds: string[]): Promise<number> => {
  if (loanIds.length === 0) return 0;
  const rows = await prisma.paymentSchedule.findMany({
    where: {
      loanId: { in: loanIds },
      status: "OVERDUE"
    },
    select: { amount: true, paidAmount: true }
  });
  return Math.round(
    rows.reduce((s, row) => s + (decimalToNumber(row.amount) - decimalToNumber(row.paidAmount)), 0)
  );
};

export const getManagerLiquidationDetail = async (
  managerId: string,
  dateYmd: string
): Promise<LiquidationDetailView> => {
  const base = await buildLiquidationBase(managerId);
  const { start, endExclusive } = bogotaDayBoundsUtc(dateYmd);

  const routes = await prisma.route.findMany({
    where: { managerId },
    select: { id: true, name: true, balance: true }
  });

  if (routes.length === 0) {
    throw new Error("Manager route not found.");
  }

  const routeIds = routes.map((r) => r.id);

  const byRoute: LiquidationRouteBreakdown[] = [];

  for (const r of routes) {
    const [collectedAgg, lentAgg, portfolioAgg, activeLoanIds] = await Promise.all([
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "ACTIVE",
          createdAt: { gte: start, lt: endExclusive },
          loan: { routeId: r.id }
        }
      }),
      prisma.loan.aggregate({
        _sum: { principal: true },
        where: {
          managerId,
          routeId: r.id,
          createdAt: { gte: start, lt: endExclusive }
        }
      }),
      prisma.loan.aggregate({
        _sum: { totalAmount: true },
        where: {
          routeId: r.id,
          status: "ACTIVE"
        }
      }),
      prisma.loan.findMany({
        where: { routeId: r.id, status: "ACTIVE" },
        select: { id: true }
      })
    ]);

    const loanIds = activeLoanIds.map((l) => l.id);
    const overdue = await overdueOutstandingForLoanIds(loanIds);

    byRoute.push({
      routeId: r.id,
      routeName: r.name,
      cashInRoute: Math.round(decimalToNumber(r.balance)),
      activePortfolio: portfolioAgg._sum.totalAmount
        ? Math.round(decimalToNumber(portfolioAgg._sum.totalAmount))
        : 0,
      collectedOnDate: collectedAgg._sum.amount
        ? Math.round(decimalToNumber(collectedAgg._sum.amount))
        : 0,
      lentPrincipalOnDate: lentAgg._sum.principal
        ? Math.round(decimalToNumber(lentAgg._sum.principal))
        : 0,
      overdueInstallmentsOutstanding: overdue
    });
  }

  const byFrequency: LiquidationFrequencyBreakdown[] = [];

  for (const f of FREQUENCIES) {
    const [collectedAgg, lentAgg, activeLoans, loanRows] = await Promise.all([
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "ACTIVE",
          createdAt: { gte: start, lt: endExclusive },
          loan: {
            managerId,
            routeId: { in: routeIds },
            frequency: f
          }
        }
      }),
      prisma.loan.aggregate({
        _sum: { principal: true },
        where: {
          managerId,
          routeId: { in: routeIds },
          frequency: f,
          createdAt: { gte: start, lt: endExclusive }
        }
      }),
      prisma.loan.count({
        where: {
          managerId,
          routeId: { in: routeIds },
          frequency: f,
          status: "ACTIVE"
        }
      }),
      prisma.loan.findMany({
        where: {
          managerId,
          routeId: { in: routeIds },
          frequency: f,
          status: "ACTIVE"
        },
        select: { id: true }
      })
    ]);

    const overdue = await overdueOutstandingForLoanIds(loanRows.map((x) => x.id));

    byFrequency.push({
      frequency: f,
      label: frequencyLabel(f),
      collectedOnDate: collectedAgg._sum.amount
        ? Math.round(decimalToNumber(collectedAgg._sum.amount))
        : 0,
      lentPrincipalOnDate: lentAgg._sum.principal
        ? Math.round(decimalToNumber(lentAgg._sum.principal))
        : 0,
      activeLoansCount: activeLoans,
      overdueInstallmentsOutstanding: overdue
    });
  }

  const totalsOnDate = {
    collected: byFrequency.reduce((s, x) => s + x.collectedOnDate, 0),
    lentPrincipal: byFrequency.reduce((s, x) => s + x.lentPrincipalOnDate, 0)
  };

  return {
    ...base,
    asOfDate: dateYmd,
    totalsOnDate,
    byRoute,
    byFrequency
  };
};

export const resolveLiquidationDate = (input?: string): string => {
  if (!input) {
    return getBogotaTodayYmd();
  }
  bogotaDayBoundsUtc(input);
  return input;
};

export type LiquidationReviewRowStatus = "NOT_SUBMITTED" | LiquidationReviewStatus;

export interface LiquidationReviewRowView {
  managerId: string;
  managerName: string;
  businessDate: string;
  collectedOnDate: number;
  lentPrincipalOnDate: number;
  netCashflowDay: number;
  cashInRoutes: number;
  availableToLend: number;
  reviewStatus: LiquidationReviewRowStatus;
  managerNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
}

const computeAvailableToLendForManager = async (managerId: string): Promise<number> => {
  const routes = await prisma.route.findMany({
    where: { managerId },
    select: { id: true, balance: true }
  });
  let sum = 0;
  for (const r of routes) {
    const agg = await prisma.loan.aggregate({
      _sum: { principal: true },
      where: { routeId: r.id, status: "ACTIVE" }
    });
    const principal = agg._sum.principal ? decimalToNumber(agg._sum.principal) : 0;
    const bal = decimalToNumber(r.balance);
    sum += Math.max(Math.round(bal - principal), 0);
  }
  return sum;
};

const mapReviewToRowStatus = (status: LiquidationReviewStatus | null): LiquidationReviewRowStatus => {
  if (!status) {
    return "NOT_SUBMITTED";
  }
  return status;
};

export const buildLiquidationReviewRow = async (
  managerId: string,
  dateYmd: string
): Promise<LiquidationReviewRowView> => {
  const [detail, availableToLend, manager, review] = await Promise.all([
    getManagerLiquidationDetail(managerId, dateYmd),
    computeAvailableToLendForManager(managerId),
    prisma.user.findUnique({ where: { id: managerId }, select: { name: true } }),
    prisma.liquidationReview.findUnique({
      where: {
        managerId_businessDate: {
          managerId,
          businessDate: dateYmd
        }
      },
      include: {
        reviewedBy: { select: { name: true } }
      }
    })
  ]);

  const collectedOnDate = detail.totalsOnDate.collected;
  const lentPrincipalOnDate = detail.totalsOnDate.lentPrincipal;
  const netCashflowDay = Math.round(collectedOnDate - lentPrincipalOnDate);

  return {
    managerId,
    managerName: manager?.name ?? managerId,
    businessDate: dateYmd,
    collectedOnDate,
    lentPrincipalOnDate,
    netCashflowDay,
    cashInRoutes: detail.currentBalance,
    availableToLend,
    reviewStatus: mapReviewToRowStatus(review?.status ?? null),
    managerNote: review?.managerNote ?? null,
    submittedAt: review?.submittedAt ? review.submittedAt.toISOString() : null,
    reviewedAt: review?.reviewedAt ? review.reviewedAt.toISOString() : null,
    reviewedByName: review?.reviewedBy?.name ?? null,
    reviewNote: review?.reviewNote ?? null
  };
};

export const listLiquidationReviewsForAdmin = async (
  dateYmd: string,
  page: number,
  limit: number,
  actorBusinessId: string | null,
  isSuperAdmin: boolean
): Promise<{ data: LiquidationReviewRowView[]; total: number; page: number; limit: number }> => {
  const routeRows = await prisma.route.findMany({
    select: { managerId: true },
    distinct: ["managerId"],
    where: isSuperAdmin
      ? {}
      : actorBusinessId
        ? { businessId: actorBusinessId }
        : { id: { in: [] } }
  });
  const managerIds = routeRows.map((r) => r.managerId);
  const managers = await prisma.user.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, name: true }
  });
  const nameById = new Map(managers.map((m) => [m.id, m.name]));
  const sortedIds = [...managerIds].sort((a, b) => {
    const na = nameById.get(a) ?? a;
    const nb = nameById.get(b) ?? b;
    return na.localeCompare(nb, "es");
  });

  const total = sortedIds.length;
  const { data: pageIds, page: safePage } = slicePage(sortedIds, page, limit);

  const data: LiquidationReviewRowView[] = await Promise.all(
    pageIds.map((id) => buildLiquidationReviewRow(id, dateYmd))
  );

  return { data, total, page: safePage, limit };
};

export const getLiquidationReviewForManagerSelf = async (
  managerId: string,
  dateYmd: string
): Promise<LiquidationReviewRowView> => {
  return buildLiquidationReviewRow(managerId, dateYmd);
};

export const submitLiquidationReview = async (
  managerId: string,
  dateYmd: string,
  managerNote?: string
): Promise<LiquidationReviewRowView> => {
  const routeCount = await prisma.route.count({ where: { managerId } });
  if (routeCount === 0) {
    throw new Error("You have no assigned routes.");
  }

  const existing = await prisma.liquidationReview.findUnique({
    where: {
      managerId_businessDate: {
        managerId,
        businessDate: dateYmd
      }
    }
  });

  if (existing?.status === "APPROVED") {
    throw new Error("Liquidation for this date is already approved.");
  }

  const safeManagerNote = sanitizePlainText(managerNote);

  if (existing?.status === "SUBMITTED") {
    await prisma.liquidationReview.update({
      where: { id: existing.id },
      data: {
        managerNote: safeManagerNote ?? null,
        submittedAt: new Date()
      }
    });
    return buildLiquidationReviewRow(managerId, dateYmd);
  }

  await prisma.liquidationReview.upsert({
    where: {
      managerId_businessDate: {
        managerId,
        businessDate: dateYmd
      }
    },
    create: {
      managerId,
      businessDate: dateYmd,
      status: "SUBMITTED",
      managerNote: safeManagerNote ?? null
    },
    update: {
      status: "SUBMITTED",
      managerNote: safeManagerNote ?? null,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null
    }
  });

  return buildLiquidationReviewRow(managerId, dateYmd);
};

export const approveLiquidationReview = async (
  reviewerId: string,
  managerId: string,
  dateYmd: string,
  reviewNote: string | undefined,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LiquidationReviewRowView> => {
  await assertManagerInBusinessScope(managerId, actorRoles, actorBusinessId);

  const existing = await prisma.liquidationReview.findUnique({
    where: {
      managerId_businessDate: {
        managerId,
        businessDate: dateYmd
      }
    }
  });

  if (!existing) {
    throw new Error("No liquidation submission found for this manager and date.");
  }
  if (existing.status !== "SUBMITTED") {
    throw new Error("Only a submitted liquidation can be approved.");
  }

  const safeReviewNote = sanitizePlainText(reviewNote);

  await prisma.liquidationReview.update({
    where: { id: existing.id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      reviewNote: safeReviewNote ?? null
    }
  });

  return buildLiquidationReviewRow(managerId, dateYmd);
};

export const rejectLiquidationReview = async (
  reviewerId: string,
  managerId: string,
  dateYmd: string,
  reason: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LiquidationReviewRowView> => {
  await assertManagerInBusinessScope(managerId, actorRoles, actorBusinessId);

  const existing = await prisma.liquidationReview.findUnique({
    where: {
      managerId_businessDate: {
        managerId,
        businessDate: dateYmd
      }
    }
  });

  if (!existing) {
    throw new Error("No liquidation submission found for this manager and date.");
  }
  if (existing.status !== "SUBMITTED") {
    throw new Error("Only a submitted liquidation can be rejected.");
  }

  const safeReason = sanitizePlainText(reason);
  if (!safeReason || safeReason.length < 3) {
    throw new Error("Invalid rejection reason.");
  }

  await prisma.liquidationReview.update({
    where: { id: existing.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      reviewNote: safeReason
    }
  });

  return buildLiquidationReviewRow(managerId, dateYmd);
};
