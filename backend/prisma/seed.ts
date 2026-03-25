// backend/prisma/seed.ts
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type AppModule, type RoleName } from "@prisma/client";
import { calculateLoan } from "../src/shared/loan-calculator.js";
import { ALL_APP_MODULES } from "../src/shared/role-modules.js";

const prisma = new PrismaClient();

interface SeedUser {
  name: string;
  email: string;
  phone: string;
  documentId: string;
  password: string;
  role: RoleName;
}

const users: SeedUser[] = [
  {
    name: "Super Admin",
    email: "superadmin@test.com",
    phone: "3000000001",
    documentId: "900000001",
    password: "Admin123!",
    role: "SUPER_ADMIN"
  },
  {
    name: "Admin",
    email: "admin@test.com",
    phone: "3000000002",
    documentId: "900000002",
    password: "Admin123!",
    role: "ADMIN"
  },
  {
    name: "Encargado Ruta",
    email: "encargado@test.com",
    phone: "3000000003",
    documentId: "900000003",
    password: "Admin123!",
    role: "ROUTE_MANAGER"
  },
  {
    name: "Cliente Uno",
    email: "cliente@test.com",
    phone: "3000000004",
    documentId: "800000001",
    password: "Admin123!",
    role: "CLIENT"
  },
  {
    name: "Cliente Dos",
    email: "cliente2@test.com",
    phone: "3000000005",
    documentId: "800000002",
    password: "Admin123!",
    role: "CLIENT"
  }
];

const defaultGrants: Record<RoleName, AppModule[]> = {
  SUPER_ADMIN: [...ALL_APP_MODULES],
  ADMIN: [
    "OVERVIEW",
    "ROUTES",
    "CLIENTS",
    "LOANS",
    "PAYMENTS",
    "TREASURY",
    "NOTIFICATIONS",
    "USERS"
  ],
  ROUTE_MANAGER: ["OVERVIEW", "CLIENTS", "LOANS", "PAYMENTS", "TREASURY", "NOTIFICATIONS"],
  CLIENT: ["OVERVIEW", "LOANS", "PAYMENTS", "NOTIFICATIONS"]
};

const run = async (): Promise<void> => {
  for (const roleName of ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"] as const) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName }
    });
  }

  const business = await prisma.business.upsert({
    where: { id: "seed-business-demo" },
    update: { name: "Negocio Demo" },
    create: {
      id: "seed-business-demo",
      name: "Negocio Demo"
    }
  });

  await prisma.roleModuleGrant.deleteMany();
  const grantRows: { roleName: RoleName; module: AppModule }[] = [];
  for (const [roleName, modules] of Object.entries(defaultGrants) as [RoleName, AppModule[]][]) {
    for (const module of modules) {
      grantRows.push({ roleName, module });
    }
  }
  await prisma.roleModuleGrant.createMany({ data: grantRows });

  for (const entry of users) {
    const passwordHash = await bcrypt.hash(entry.password, 12);
    const businessId = entry.role === "SUPER_ADMIN" ? null : business.id;
    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: {
        name: entry.name,
        phone: entry.phone,
        documentId: entry.documentId,
        passwordHash,
        businessId
      },
      create: {
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        documentId: entry.documentId,
        passwordHash,
        businessId
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
        data: { name: "Ruta Norte", balance: 2000000, businessId: business.id }
      })
    : await prisma.route.create({
        data: {
          name: "Ruta Norte",
          managerId: manager.id,
          balance: 2000000,
          businessId: business.id
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
  if (existingLoansCount > 0) {
    return;
  }

  const now = new Date();
  const managerId = manager.id;

  const loanForClient = async (
    clientId: string,
    input: {
      principal: number;
      interestRate: number;
      installmentCount: number;
      frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
      startDate: Date;
      paidInstallmentNumbers: number[];
      overdueInstallmentNumbers: number[];
    }
  ): Promise<void> => {
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
