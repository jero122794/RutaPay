// backend/src/modules/loans/service.ts
import type { LoanStatus, Prisma } from "@prisma/client";
import { calculateLoan } from "../../shared/loan-calculator.js";
import { prisma } from "../../shared/prisma.js";
import type { CalculateLoanInput, CreateLoanInput, UpdateLoanStatusInput } from "./schema.js";

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

const ensureLoanAccess = async (
  loanId: string,
  actorId: string,
  actorRoles: string[]
): Promise<LoanView> => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) {
    throw new Error("Loan not found.");
  }

  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const isManagerOwner = actorRoles.includes("ROUTE_MANAGER") && loan.managerId === actorId;
  const isClientOwner = actorRoles.includes("CLIENT") && loan.clientId === actorId;

  if (!isPrivileged && !isManagerOwner && !isClientOwner) {
    throw new Error("You do not have access to this loan.");
  }

  return mapLoan(loan);
};

export const listLoans = async (actorId: string, actorRoles: string[]): Promise<LoanView[]> => {
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const where = isPrivileged
    ? {}
    : actorRoles.includes("ROUTE_MANAGER")
      ? { managerId: actorId }
      : { clientId: actorId };

  const loans = await prisma.loan.findMany({
    where,
    orderBy: { createdAt: "desc" }
  });

  return loans.map(mapLoan);
};

export const calculateLoanPreview = (input: CalculateLoanInput) => {
  return calculateLoan({
    principal: input.principal,
    interestRate: input.interestRate,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    startDate: input.startDate
  });
};

export const createLoan = async (
  input: CreateLoanInput,
  actorId: string,
  actorRoles: string[]
): Promise<LoanView> => {
  const route = await prisma.route.findUnique({ where: { id: input.routeId } });
  if (!route) {
    throw new Error("Route not found.");
  }

  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const managerId = isPrivileged ? input.managerId ?? route.managerId : actorId;

  if (!isPrivileged && route.managerId !== actorId) {
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
    startDate: input.startDate
  });

  const termDays = frequencyDays[input.frequency] * input.installmentCount;

  const createdLoan = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        routeId: input.routeId,
        clientId: input.clientId,
        managerId,
        principal: input.principal,
        interestRate: input.interestRate,
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
  actorRoles: string[]
): Promise<LoanView> => ensureLoanAccess(id, actorId, actorRoles);

export const updateLoanStatus = async (
  id: string,
  input: UpdateLoanStatusInput
): Promise<LoanView> => {
  const updated = await prisma.loan.update({
    where: { id },
    data: { status: input.status }
  });
  return mapLoan(updated);
};

export const getLoanSchedule = async (
  loanId: string,
  actorId: string,
  actorRoles: string[]
): Promise<ScheduleView[]> => {
  await ensureLoanAccess(loanId, actorId, actorRoles);

  const schedule = await prisma.paymentSchedule.findMany({
    where: { loanId },
    orderBy: { installmentNumber: "asc" }
  });

  return schedule.map((item) => ({
    id: item.id,
    installmentNumber: item.installmentNumber,
    dueDate: item.dueDate,
    amount: decimalToNumber(item.amount),
    paidAmount: decimalToNumber(item.paidAmount),
    status: item.status,
    paidAt: item.paidAt
  }));
};
