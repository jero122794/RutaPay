// backend/src/modules/payments/service.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma.js";
import type { CreatePaymentInput } from "./schema.js";

interface PaymentView {
  id: string;
  loanId: string;
  scheduleId: string | null;
  amount: number;
  registeredById: string;
  notes: string | null;
  createdAt: Date;
}

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const ensureLoanAccess = async (
  loanId: string,
  actorId: string,
  actorRoles: string[]
): Promise<{ id: string; managerId: string; clientId: string }> => {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: { id: true, managerId: true, clientId: true }
  });

  if (!loan) {
    throw new Error("Loan not found.");
  }

  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const isManagerOwner = actorRoles.includes("ROUTE_MANAGER") && loan.managerId === actorId;
  const isClientOwner = actorRoles.includes("CLIENT") && loan.clientId === actorId;

  if (!isPrivileged && !isManagerOwner && !isClientOwner) {
    throw new Error("You do not have access to this loan.");
  }

  return loan;
};

const mapPayment = (payment: {
  id: string;
  loanId: string;
  scheduleId: string | null;
  amount: Prisma.Decimal;
  registeredById: string;
  notes: string | null;
  createdAt: Date;
}): PaymentView => ({
  id: payment.id,
  loanId: payment.loanId,
  scheduleId: payment.scheduleId,
  amount: decimalToNumber(payment.amount),
  registeredById: payment.registeredById,
  notes: payment.notes,
  createdAt: payment.createdAt
});

export const listPayments = async (actorId: string, actorRoles: string[]): Promise<PaymentView[]> => {
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const where = isPrivileged
    ? {}
    : actorRoles.includes("ROUTE_MANAGER")
      ? { loan: { managerId: actorId } }
      : { loan: { clientId: actorId } };

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" }
  });

  return payments.map(mapPayment);
};

export const createPayment = async (
  input: CreatePaymentInput,
  actorId: string,
  actorRoles: string[]
): Promise<PaymentView> => {
  const canRegister = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN") || actorRoles.includes("ROUTE_MANAGER");
  if (!canRegister) {
    throw new Error("You do not have permission to register payments.");
  }

  await ensureLoanAccess(input.loanId, actorId, actorRoles);

  const payment = await prisma.$transaction(async (tx) => {
    if (input.scheduleId) {
      const startSchedule = await tx.paymentSchedule.findUnique({
        where: { id: input.scheduleId }
      });

      if (!startSchedule || startSchedule.loanId !== input.loanId) {
        throw new Error("Schedule not found for this loan.");
      }

      const schedules = await tx.paymentSchedule.findMany({
        where: {
          loanId: input.loanId,
          installmentNumber: { gte: startSchedule.installmentNumber }
        },
        orderBy: { installmentNumber: "asc" }
      });

      // Distribute payment amount from the selected installment forward.
      // This allows a "total credit" payment to automatically settle future installments.
      let remaining = input.amount;
      let lastCreatedPayment:
        | {
            id: string;
            loanId: string;
            scheduleId: string | null;
            amount: Prisma.Decimal;
            registeredById: string;
            notes: string | null;
            createdAt: Date;
          }
        | null = null;

      for (const schedule of schedules) {
        if (remaining <= 0) break;

        // Money should be handled as integers. We round Decimal->number to avoid
        // tiny binary/representation differences during comparisons.
        const targetAmountNumber = Math.round(decimalToNumber(schedule.amount));
        const currentPaidAmountNumber = Math.round(decimalToNumber(schedule.paidAmount));
        const outstanding = targetAmountNumber - currentPaidAmountNumber;

        if (outstanding <= 0) continue;

        const allocation = Math.min(remaining, outstanding);
        const nextPaidAmountNumber = currentPaidAmountNumber + allocation;
        const isPaid = nextPaidAmountNumber >= targetAmountNumber;

        const nextStatus = isPaid ? "PAID" : "PARTIAL";

        await tx.paymentSchedule.update({
          where: { id: schedule.id },
          data: {
            paidAmount: isPaid ? targetAmountNumber : nextPaidAmountNumber,
            status: nextStatus,
            paidAt: isPaid ? new Date() : null
          }
        });

        lastCreatedPayment = await tx.payment.create({
          data: {
            loanId: input.loanId,
            scheduleId: schedule.id,
            amount: allocation,
            notes: input.notes,
            registeredById: actorId
          }
        });

        remaining -= allocation;
      }

      if (!lastCreatedPayment) {
        throw new Error("This schedule is already fully paid.");
      }

      if (remaining > 0) {
        // If remaining is due to numeric representation errors, allow a no-op remainder.
        if (Math.round(remaining) > 0) {
          throw new Error("Payment exceeds the outstanding amount for the selected and future installments.");
        }
      }

      // If all installments of the loan are now PAID, mark the loan as COMPLETED.
      const nonPaidSchedulesCount = await tx.paymentSchedule.count({
        where: { loanId: input.loanId, status: { not: "PAID" } }
      });

      if (nonPaidSchedulesCount === 0) {
        await tx.loan.update({
          where: { id: input.loanId },
          data: { status: "COMPLETED" }
        });
      }

      return lastCreatedPayment;
    }

    return tx.payment.create({
      data: {
        loanId: input.loanId,
        scheduleId: input.scheduleId,
        amount: input.amount,
        notes: input.notes,
        registeredById: actorId
      }
    });
  });

  return mapPayment(payment);
};

export const listPaymentsByLoan = async (
  loanId: string,
  actorId: string,
  actorRoles: string[]
): Promise<PaymentView[]> => {
  await ensureLoanAccess(loanId, actorId, actorRoles);
  const payments = await prisma.payment.findMany({
    where: { loanId },
    orderBy: { createdAt: "desc" }
  });
  return payments.map(mapPayment);
};
