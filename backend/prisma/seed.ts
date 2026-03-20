// backend/prisma/seed.ts
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type RoleName } from "@prisma/client";
import { calculateLoan } from "../src/shared/loan-calculator.js";

const prisma = new PrismaClient();

interface SeedUser {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: RoleName;
}

const users: SeedUser[] = [
  { name: "Super Admin", email: "superadmin@test.com", phone: "3000000001", password: "Admin123!", role: "SUPER_ADMIN" },
  { name: "Admin", email: "admin@test.com", phone: "3000000002", password: "Admin123!", role: "ADMIN" },
  { name: "Encargado Ruta", email: "encargado@test.com", phone: "3000000003", password: "Admin123!", role: "ROUTE_MANAGER" },
  { name: "Cliente Uno", email: "cliente@test.com", phone: "3000000004", password: "Admin123!", role: "CLIENT" },
  { name: "Cliente Dos", email: "cliente2@test.com", phone: "3000000005", password: "Admin123!", role: "CLIENT" }
];

const run = async (): Promise<void> => {
  for (const roleName of ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"] as const) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName }
    });
  }

  for (const entry of users) {
    const passwordHash = await bcrypt.hash(entry.password, 12);
    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: {
        name: entry.name,
        phone: entry.phone,
        passwordHash
      },
      create: {
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        passwordHash
      }
    });

    const role = await prisma.role.findUniqueOrThrow({ where: { name: entry.role } });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id
      }
    });
  }

  const manager = await prisma.user.findUniqueOrThrow({ where: { email: "encargado@test.com" } });
  const clientOne = await prisma.user.findUniqueOrThrow({ where: { email: "cliente@test.com" } });
  const clientTwo = await prisma.user.findUniqueOrThrow({ where: { email: "cliente2@test.com" } });

  const existingRoute = await prisma.route.findFirst({
    where: { managerId: manager.id }
  });

  const route = existingRoute
    ? await prisma.route.update({
        where: { id: existingRoute.id },
        data: { name: "Ruta Norte", balance: 2000000 }
      })
    : await prisma.route.create({
        data: {
          name: "Ruta Norte",
          managerId: manager.id,
          balance: 2000000
        }
      });

  for (const client of [clientOne, clientTwo]) {
    await prisma.routeClient.upsert({
      where: {
        routeId_clientId: {
          routeId: route.id,
          clientId: client.id
        }
      },
      update: {},
      create: {
        routeId: route.id,
        clientId: client.id
      }
    });
  }

  const existingLoansCount = await prisma.loan.count();
  if (existingLoansCount > 0) return;

  const now = new Date();
  const managerId = manager.id;

  const loanForClient = async (clientId: string, input: {
    principal: number;
    interestRate: number;
    installmentCount: number;
    frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
    startDate: Date;
    paidInstallmentNumbers: number[];
    overdueInstallmentNumbers: number[];
  }): Promise<void> => {
    const preview = calculateLoan({
      principal: input.principal,
      interestRate: input.interestRate,
      installmentCount: input.installmentCount,
      frequency: input.frequency,
      startDate: input.startDate
    });

    const frequencyDays: Record<"DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY", number> = {
      DAILY: 1,
      WEEKLY: 7,
      BIWEEKLY: 15,
      MONTHLY: 30
    };

    const termDays = frequencyDays[input.frequency] * input.installmentCount;

    await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          routeId: route.id,
          clientId,
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

      for (const item of preview.schedule) {
        const isOverdue = input.overdueInstallmentNumbers.includes(item.installmentNumber);
        const isPaid = input.paidInstallmentNumbers.includes(item.installmentNumber);

        const status: "PENDING" | "PAID" | "OVERDUE" = isPaid
          ? "PAID"
          : isOverdue
            ? "OVERDUE"
            : "PENDING";
        const paidAmount = isPaid ? new Prisma.Decimal(item.amount) : new Prisma.Decimal(0);
        const paidAt: Date | null = isPaid ? new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) : null;

        const schedule = await tx.paymentSchedule.create({
          data: {
            loanId: loan.id,
            installmentNumber: item.installmentNumber,
            dueDate: item.dueDate,
            amount: new Prisma.Decimal(item.amount),
            paidAmount,
            status,
            paidAt
          }
        });

        if (isPaid) {
          await tx.payment.create({
            data: {
              loanId: loan.id,
              scheduleId: schedule.id,
              amount: new Prisma.Decimal(item.amount),
              registeredById: managerId,
              notes: "Pago registrado en seed.",
              createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
            }
          });
        }
      }
    });
  };

  // Client 1: 1 cuota en mora (installmentNumber 1) y 1 pago registrado (installmentNumber 2)
  const client1Start = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
  await loanForClient(clientOne.id, {
    principal: 500000,
    interestRate: 0.2,
    installmentCount: 3,
    frequency: "MONTHLY",
    startDate: client1Start,
    paidInstallmentNumbers: [2],
    overdueInstallmentNumbers: [1]
  });

  // Client 2: plan activo con cuotas pendientes (sin mora)
  const client2Start = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  await loanForClient(clientTwo.id, {
    principal: 700000,
    interestRate: 0.15,
    installmentCount: 2,
    frequency: "MONTHLY",
    startDate: client2Start,
    paidInstallmentNumbers: [],
    overdueInstallmentNumbers: []
  });
};

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
