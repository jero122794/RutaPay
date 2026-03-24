// backend/src/modules/payments/service.ts
import type { Prisma } from "@prisma/client";
import { assertLoanAccessForActor } from "../../shared/loan-ownership.js";
import { sanitizePlainText } from "../../shared/sanitize.js";
import type { PaginationQuery } from "../../shared/pagination.schema.js";
import { prismaPaginationBounds } from "../../shared/pagination.schema.js";
import { prisma } from "../../shared/prisma.js";
import type { CreatePaymentInput, ReversePaymentInput } from "./schema.js";

interface PaymentView {
  id: string;
  loanId: string;
  clientId: string;
  clientName: string;
  scheduleId: string | null;
  amount: number;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  registeredById: string;
  notes: string | null;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
  createdAt: Date;
}

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const mapPayment = (payment: {
  id: string;
  loanId: string;
  loan: {
    clientId: string;
    client: { name: string };
  };
  scheduleId: string | null;
  amount: Prisma.Decimal;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  registeredById: string;
  notes: string | null;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
  createdAt: Date;
}): PaymentView => ({
  id: payment.id,
  loanId: payment.loanId,
  clientId: payment.loan.clientId,
  clientName: payment.loan.client.name,
  scheduleId: payment.scheduleId,
  amount: decimalToNumber(payment.amount),
  method: payment.method,
  // Normalize so clients never see a missing/ambiguous status (breaks reverse UI).
  status: payment.status === "REVERSED" ? "REVERSED" : "ACTIVE",
  registeredById: payment.registeredById,
  notes: payment.notes,
  reversedAt: payment.reversedAt,
  reversedById: payment.reversedById,
  reversalReason: payment.reversalReason,
  createdAt: payment.createdAt
});

export const listPayments = async (
  actorId: string,
  actorRoles: string[],
  pagination: PaginationQuery | null
): Promise<{ data: PaymentView[]; total: number; page: number; limit: number }> => {
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const where = isPrivileged
    ? {}
    : actorRoles.includes("ROUTE_MANAGER")
      ? { loan: { route: { managerId: actorId } } }
      : { loan: { clientId: actorId } };

  const include = {
    loan: {
      select: {
        clientId: true,
        client: { select: { name: true } }
      }
    }
  };

  const total = await prisma.payment.count({ where });

  if (!pagination) {
    const payments = await prisma.payment.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" }
    });
    const data = payments.map(mapPayment);
    return { data, total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const payments = await prisma.payment.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
    skip,
    take
  });
  return { data: payments.map(mapPayment), total, page, limit: pagination.limit };
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

  await assertLoanAccessForActor(input.loanId, actorId, actorRoles);

  const notes = sanitizePlainText(input.notes);

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
      let lastCreatedPayment: {
        id: string;
        loanId: string;
        loan: {
          clientId: string;
          client: { name: string };
        };
        scheduleId: string | null;
        amount: Prisma.Decimal;
        method: "CASH" | "TRANSFER";
        status: "ACTIVE" | "REVERSED";
        registeredById: string;
        notes: string | null;
        reversedAt: Date | null;
        reversedById: string | null;
        reversalReason: string | null;
        createdAt: Date;
      } | null = null;

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
            method: input.method,
            status: "ACTIVE",
            notes,
            registeredById: actorId
          },
          include: {
            loan: {
              select: {
                clientId: true,
                client: { select: { name: true } }
              }
            }
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
        method: input.method,
        status: "ACTIVE",
        notes,
        registeredById: actorId
      },
      include: {
        loan: {
          select: {
            clientId: true,
            client: { select: { name: true } }
          }
        }
      }
    });
  });

  return mapPayment(payment);
};

export const listPaymentsByLoan = async (
  loanId: string,
  actorId: string,
  actorRoles: string[],
  pagination: PaginationQuery | null
): Promise<{ data: PaymentView[]; total: number; page: number; limit: number }> => {
  await assertLoanAccessForActor(loanId, actorId, actorRoles);
  const where = { loanId };
  const include = {
    loan: {
      select: {
        clientId: true,
        client: { select: { name: true } }
      }
    }
  };

  const total = await prisma.payment.count({ where });

  if (!pagination) {
    const payments = await prisma.payment.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" }
    });
    const data = payments.map(mapPayment);
    return { data, total, page: 1, limit: total };
  }

  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);
  const payments = await prisma.payment.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
    skip,
    take
  });
  return { data: payments.map(mapPayment), total, page, limit: pagination.limit };
};

export const reversePayment = async (
  paymentId: string,
  input: ReversePaymentInput,
  actorId: string,
  actorRoles: string[]
): Promise<PaymentView> => {
  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  if (!isPrivileged) {
    throw new Error("You do not have permission to reverse payments.");
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      loan: {
        select: {
          clientId: true,
          client: { select: { name: true } }
        }
      }
    }
  });

  if (!payment) {
    throw new Error("Payment not found.");
  }
  if (payment.status === "REVERSED") {
    throw new Error("Payment is already reversed.");
  }
  if (!payment.scheduleId) {
    throw new Error("Only installment-linked payments can be reversed.");
  }

  const reversed = await prisma.$transaction(async (tx) => {
    const schedule = await tx.paymentSchedule.findUnique({
      where: { id: payment.scheduleId! }
    });
    if (!schedule) {
      throw new Error("Schedule not found.");
    }

    const currentPaid = Math.round(decimalToNumber(schedule.paidAmount));
    const paymentAmount = Math.round(decimalToNumber(payment.amount));
    const scheduleAmount = Math.round(decimalToNumber(schedule.amount));
    const nextPaid = Math.max(0, currentPaid - paymentAmount);
    const nextStatus: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL" =
      nextPaid <= 0 ? "PENDING" : nextPaid >= scheduleAmount ? "PAID" : "PARTIAL";

    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        paidAmount: nextPaid,
        status: nextStatus,
        paidAt: nextStatus === "PAID" ? schedule.paidAt ?? new Date() : null
      }
    });

    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: actorId,
        reversalReason: sanitizePlainText(input.reason) ?? input.reason ?? null
      },
      include: {
        loan: {
          select: {
            clientId: true,
            client: { select: { name: true } }
          }
        }
      }
    });

    const nonPaidSchedulesCount = await tx.paymentSchedule.count({
      where: { loanId: payment.loanId, status: { not: "PAID" } }
    });
    await tx.loan.update({
      where: { id: payment.loanId },
      data: { status: nonPaidSchedulesCount === 0 ? "COMPLETED" : "ACTIVE" }
    });

    return updatedPayment;
  });

  return mapPayment(reversed);
};
