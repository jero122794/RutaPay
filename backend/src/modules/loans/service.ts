// backend/src/modules/loans/service.ts
import type { LoanStatus, Prisma } from "@prisma/client";
import { calculateLoan } from "../../shared/loan-calculator.js";
import { computeLatePenaltyCOP, interestSharePerInstallmentCOP } from "../../shared/late-penalty.js";
import { assertLoanAccessForActor, loanRowWithoutRoute } from "../../shared/loan-ownership.js";
import type { PaginationQuery } from "../../shared/pagination.schema.js";
import { prismaPaginationBounds } from "../../shared/pagination.schema.js";
import { prisma } from "../../shared/prisma.js";
import type {
  CalculateLoanInput,
  CreateLoanInput,
  UpdateLoanStatusInput,
  UpdateLoanTermsInput
} from "./schema.js";

interface LoanView {
  id: string;
  routeId: string;
  clientId: string;
  managerId: string;
  principal: number;
  interestRate: number;
  termDays: number;
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  installmentCount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  status: LoanStatus;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ScheduleView {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  latePenalty: number;
  totalDue: number;
  pendingAmount: number;
  paidAmount: number;
  status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
  paidAt: Date | null;
}

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const mapLoan = (loan: {
  id: string;
  routeId: string;
  clientId: string;
  managerId: string;
  principal: Prisma.Decimal;
  interestRate: Prisma.Decimal;
  termDays: number;
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  installmentCount: number;
  installmentAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  totalInterest: Prisma.Decimal;
  status: LoanStatus;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}): LoanView => ({
  id: loan.id,
  routeId: loan.routeId,
  clientId: loan.clientId,
  managerId: loan.managerId,
  principal: decimalToNumber(loan.principal),
  interestRate: decimalToNumber(loan.interestRate),
  termDays: loan.termDays,
  frequency: loan.frequency,
  installmentCount: loan.installmentCount,
  installmentAmount: decimalToNumber(loan.installmentAmount),
  totalAmount: decimalToNumber(loan.totalAmount),
  totalInterest: decimalToNumber(loan.totalInterest),
  status: loan.status,
  startDate: loan.startDate,
  endDate: loan.endDate,
  createdAt: loan.createdAt,
  updatedAt: loan.updatedAt
});

const frequencyDays: Record<"DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY", number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 15,
  MONTHLY: 30
};

export const listLoans = async (
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null,
  pagination: PaginationQuery | null
): Promise<{ data: LoanView[]; total: number; page: number; limit: number }> => {
  const isSuper = actorRoles.includes("SUPER_ADMIN");
  const isAdmin = actorRoles.includes("ADMIN") && !isSuper;
  let where: Prisma.LoanWhereInput;
  if (isSuper) {
    where = {};
  } else if (isAdmin) {
    where = actorBusinessId
      ? { route: { businessId: actorBusinessId } }
      : { id: { in: [] } };
  } else if (actorRoles.includes("ROUTE_MANAGER")) {
    where = { managerId: actorId };
  } else {
    where = { clientId: actorId };
  }

  const total = await prisma.loan.count({ where });

  if (!pagination) {
    const loans = await prisma.loan.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    return { data: loans.map(mapLoan), total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const loans = await prisma.loan.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take
  });
  return { data: loans.map(mapLoan), total, page, limit: pagination.limit };
};

export const calculateLoanPreview = (input: CalculateLoanInput) => {
  return calculateLoan({
    principal: input.principal,
    interestRate: input.interestRate / 100,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    startDate: input.startDate,
    excludeWeekends: input.excludeWeekends ?? false
  });
};

export const createLoan = async (
  input: CreateLoanInput,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LoanView> => {
  const route = await prisma.route.findUnique({ where: { id: input.routeId } });
  if (!route) {
    throw new Error("Route not found.");
  }

  const isSuper = actorRoles.includes("SUPER_ADMIN");
  const isAdmin = actorRoles.includes("ADMIN") && !isSuper;
  const isPrivileged = isSuper || isAdmin;
  const managerId = isPrivileged ? input.managerId ?? route.managerId : actorId;

  if (isAdmin) {
    if (!actorBusinessId || route.businessId !== actorBusinessId) {
      throw new Error("You do not have access to this route.");
    }
  } else if (!isSuper && route.managerId !== actorId) {
    throw new Error("You do not have access to this route.");
  }

  const routeClient = await prisma.routeClient.findUnique({
    where: {
      routeId_clientId: {
        routeId: input.routeId,
        clientId: input.clientId
      }
    }
  });

  if (!routeClient) {
    throw new Error("Client is not assigned to this route.");
  }

  const preview = calculateLoanPreview({
    principal: input.principal,
    interestRate: input.interestRate,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    startDate: input.startDate,
    excludeWeekends: input.excludeWeekends ?? false
  });

  const termDays = Math.max(
    1,
    Math.round((preview.endDate.getTime() - input.startDate.getTime()) / (24 * 60 * 60 * 1000))
  );

  const createdLoan = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        routeId: input.routeId,
        clientId: input.clientId,
        managerId,
        principal: input.principal,
        interestRate: input.interestRate / 100,
        termDays,
        frequency: input.frequency,
        installmentCount: input.installmentCount,
        installmentAmount: preview.installmentAmount,
        totalAmount: preview.totalAmount,
        totalInterest: preview.totalInterest,
        startDate: input.startDate,
        endDate: preview.endDate
      }
    });

    await tx.paymentSchedule.createMany({
      data: preview.schedule.map((item) => ({
        loanId: loan.id,
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        amount: item.amount,
        status: "PENDING"
      }))
    });

    return loan;
  });

  return mapLoan(createdLoan);
};

export const getLoanById = async (
  id: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LoanView> => {
  const loan = await assertLoanAccessForActor(id, actorId, actorRoles, actorBusinessId);
  return mapLoan(loanRowWithoutRoute(loan));
};

export const updateLoanStatus = async (
  id: string,
  input: UpdateLoanStatusInput,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LoanView> => {
  await assertLoanAccessForActor(id, actorId, actorRoles, actorBusinessId);
  const isAdmin =
    actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  if (!isAdmin) {
    throw new Error("Only administrators can change loan status.");
  }
  const updated = await prisma.loan.update({
    where: { id },
    data: { status: input.status }
  });
  return mapLoan(updated);
};

export const deleteLoan = async (
  id: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<void> => {
  const isAdminOnly = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  if (!isAdminOnly) {
    throw new Error("Only administrators can delete loans.");
  }

  await assertLoanAccessForActor(id, actorId, actorRoles, actorBusinessId);

  const paymentCount = await prisma.payment.count({ where: { loanId: id } });
  if (paymentCount > 0) {
    throw new Error("Cannot delete a loan that has registered payments.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentSchedule.deleteMany({ where: { loanId: id } });
    await tx.loan.delete({ where: { id } });
  });
};

export const updateLoanTerms = async (
  id: string,
  input: UpdateLoanTermsInput,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LoanView> => {
  const isAdminOnly = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  if (!isAdminOnly) {
    throw new Error("Only administrators can update loan terms.");
  }

  const loan = await assertLoanAccessForActor(id, actorId, actorRoles, actorBusinessId);
  const row = loanRowWithoutRoute(loan);

  if (row.status !== "ACTIVE") {
    throw new Error("Only ACTIVE loans can have terms corrected.");
  }

  const [paymentCount, schedules] = await Promise.all([
    prisma.payment.count({ where: { loanId: id } }),
    prisma.paymentSchedule.findMany({ where: { loanId: id } })
  ]);

  if (paymentCount > 0) {
    throw new Error("Cannot correct terms after payments have been registered.");
  }

  const hasCollected = schedules.some(
    (s) => decimalToNumber(s.paidAmount) > 0 || s.status === "PAID" || s.status === "PARTIAL"
  );
  if (hasCollected) {
    throw new Error("Cannot correct terms after installments have been collected.");
  }

  const principal = decimalToNumber(row.principal);
  const interestPercent = input.interestRate;
  const nextInstallmentCount = input.installmentCount ?? row.installmentCount;

  const preview = calculateLoanPreview({
    principal,
    interestRate: interestPercent,
    installmentCount: nextInstallmentCount,
    frequency: input.frequency,
    startDate: row.startDate,
    excludeWeekends: false
  });

  const termDays = Math.max(
    1,
    Math.round((preview.endDate.getTime() - row.startDate.getTime()) / (24 * 60 * 60 * 1000))
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.paymentSchedule.deleteMany({ where: { loanId: id } });

    const next = await tx.loan.update({
      where: { id },
      data: {
        interestRate: interestPercent / 100,
        frequency: input.frequency,
        installmentCount: nextInstallmentCount,
        termDays,
        installmentAmount: preview.installmentAmount,
        totalAmount: preview.totalAmount,
        totalInterest: preview.totalInterest,
        endDate: preview.endDate
      }
    });

    await tx.paymentSchedule.createMany({
      data: preview.schedule.map((item) => ({
        loanId: id,
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        amount: item.amount,
        status: "PENDING" as const
      }))
    });

    return next;
  });

  return mapLoan(updated);
};

export const getLoanSchedule = async (
  loanId: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<ScheduleView[]> => {
  await assertLoanAccessForActor(loanId, actorId, actorRoles, actorBusinessId);

  const [schedule, loan] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { loanId },
      orderBy: { installmentNumber: "asc" }
    }),
    prisma.loan.findUnique({
      where: { id: loanId },
      select: { totalInterest: true, installmentCount: true }
    })
  ]);

  if (!loan) {
    throw new Error("Loan not found.");
  }

  const interestShareCOP = interestSharePerInstallmentCOP(
    Math.round(decimalToNumber(loan.totalInterest)),
    loan.installmentCount
  );
  const now = new Date();

  return schedule.map((item) => {
    const amount = decimalToNumber(item.amount);
    const paidAmount = decimalToNumber(item.paidAmount);
    // Mora is calculated dynamically from due date (Bogotá calendar days).
    // It is applied in payments; exposing it here keeps UI totals aligned.
    const latePenalty = item.status === "PAID" ? 0 : computeLatePenaltyCOP(item.dueDate, now, interestShareCOP);
    const totalDue = amount + latePenalty;
    const pendingAmount = Math.max(totalDue - paidAmount, 0);

    return {
      id: item.id,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      amount,
      latePenalty,
      totalDue,
      pendingAmount,
      paidAmount,
      status: item.status,
      paidAt: item.paidAt
    };
  });
};
