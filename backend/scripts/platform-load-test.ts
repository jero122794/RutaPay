#!/usr/bin/env npx tsx
/**
 * Platform load / integration dataset for RutaPay.
 *
 * Target scale (override with env):
 * - PLATFORM_TEST_BUSINESSES (default 10)
 * - PLATFORM_TEST_CLIENTS_PER_ROUTE (default 50; lower for faster dry runs)
 * - PLATFORM_TEST_SEED=12345 (RNG reproducibility)
 * - PLATFORM_TEST_RESET=1 — delete previous runs (Business.name starts with "PlatformTest ")
 *
 * Creates: businesses, 2 admins each, 6–10 route managers, 10–15 routes per business,
 * N clients per route, route credits, loans (all frequencies), some payments,
 * overdue schedules, liquidation submissions per manager.
 *
 * Logs PASS/FAIL checks for loan math and data integrity.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import bcrypt from "bcryptjs";
import {
  Prisma,
  PrismaClient,
  type Frequency,
  type LoanStatus,
  type RoleName
} from "@prisma/client";
import { calculateLoan, type LoanFrequency } from "../src/shared/loan-calculator.js";
import { parseBogotaDateOnlyToUTC } from "../src/shared/bogota-date.js";
import { getBogotaTodayYmd } from "../src/shared/bogota-day.js";
import { createPayment } from "../src/modules/payments/service.js";
import { submitLiquidationReview } from "../src/modules/treasury/service.js";

const prisma = new PrismaClient();

const PASSWORD = "PlatformTest123!";
const BUSINESS_PREFIX = "PlatformTest";

const NUM_BUSINESSES = Math.max(1, Math.min(50, parseInt(process.env.PLATFORM_TEST_BUSINESSES ?? "10", 10)));
const CLIENTS_PER_ROUTE = Math.max(1, Math.min(200, parseInt(process.env.PLATFORM_TEST_CLIENTS_PER_ROUTE ?? "50", 10)));
const RNG_SEED = parseInt(process.env.PLATFORM_TEST_SEED ?? "12345", 10);
const DO_RESET = process.env.PLATFORM_TEST_RESET === "1" || process.env.PLATFORM_TEST_RESET === "true";

/** Reference "today" for backdating loans (YYYY-MM-DD Bogotá-style parse). */
const AS_OF_YMD = process.env.PLATFORM_TEST_AS_OF ?? "2026-04-07";

type Rng = () => number;

function mulberry32(seed: number): Rng {
  return (): number => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

const decimalToNumber = (value: Prisma.Decimal): number => Number(value.toString());

const FREQUENCIES: LoanFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"];

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const checks: CheckResult[] = [];

const recordCheck = (name: string, ok: boolean, detail?: string): void => {
  checks.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? `: ${detail}` : ""}`);
};

async function deletePlatformTestData(): Promise<void> {
  const businesses = await prisma.business.findMany({
    where: { name: { startsWith: `${BUSINESS_PREFIX} ` } },
    select: { id: true }
  });
  if (businesses.length === 0) {
    console.log("No previous PlatformTest businesses to remove.");
    return;
  }
  const businessIds = businesses.map((b) => b.id);
  const routes = await prisma.route.findMany({
    where: { businessId: { in: businessIds } },
    select: { id: true, managerId: true }
  });
  const routeIds = routes.map((r) => r.id);
  const managerIds = [...new Set(routes.map((r) => r.managerId))];
  const loans = await prisma.loan.findMany({
    where: { routeId: { in: routeIds } },
    select: { id: true }
  });
  const loanIds = loans.map((l) => l.id);

  await prisma.payment.deleteMany({ where: { loanId: { in: loanIds } } });
  await prisma.paymentSchedule.deleteMany({ where: { loanId: { in: loanIds } } });
  await prisma.loan.deleteMany({ where: { id: { in: loanIds } } });
  await prisma.routeClient.deleteMany({ where: { routeId: { in: routeIds } } });
  await prisma.managerBalanceLog.deleteMany({ where: { routeId: { in: routeIds } } });
  await prisma.liquidationReview.deleteMany({ where: { managerId: { in: managerIds } } });
  await prisma.route.deleteMany({ where: { id: { in: routeIds } } });

  const tenantUsers = await prisma.user.findMany({
    where: { businessId: { in: businessIds } },
    select: { id: true }
  });
  const userIds = tenantUsers.map((u) => u.id);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  console.log(`Removed ${businessIds.length} prior PlatformTest business(es).`);
}

async function assertLoanScheduleMath(loanId: string): Promise<void> {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { schedule: { orderBy: { installmentNumber: "asc" } } }
  });
  if (!loan) {
    recordCheck(`loan-math ${loanId}`, false, "loan missing");
    return;
  }
  const principal = decimalToNumber(loan.principal);
  const rateDecimal = decimalToNumber(loan.interestRate);
  const preview = calculateLoan({
    principal,
    interestRate: rateDecimal,
    installmentCount: loan.installmentCount,
    frequency: loan.frequency as LoanFrequency,
    startDate: loan.startDate,
    excludeWeekends: false
  });

  const sumSchedule = loan.schedule.reduce((s, row) => s + decimalToNumber(row.amount), 0);
  const storedTotal = decimalToNumber(loan.totalAmount);
  const storedInterest = decimalToNumber(loan.totalInterest);
  const totalOk = sumSchedule === storedTotal;
  const previewTotalOk = preview.totalAmount === storedTotal;
  const previewInterestOk = preview.totalInterest === storedInterest;
  const nOk = loan.schedule.length === loan.installmentCount;

  const ok = totalOk && previewTotalOk && previewInterestOk && nOk;
  recordCheck(
    `loan-math ${loanId.slice(0, 8)}…`,
    ok,
    !ok
      ? `sumSch=${sumSchedule} total=${storedTotal} previewTot=${preview.totalAmount} n=${loan.schedule.length}/${loan.installmentCount}`
      : `totalAmount=${storedTotal} installments=${loan.installmentCount}`
  );
}

async function markPastDueAsOverdue(asOfUtc: Date): Promise<number> {
  const result = await prisma.paymentSchedule.updateMany({
    where: {
      status: "PENDING",
      dueDate: { lt: asOfUtc },
      paidAmount: { equals: new Prisma.Decimal(0) }
    },
    data: { status: "OVERDUE" }
  });
  return result.count;
}

async function main(): Promise<void> {
  console.log("=== RutaPay platform load test ===");
  console.log(
    JSON.stringify({
      businesses: NUM_BUSINESSES,
      clientsPerRoute: CLIENTS_PER_ROUTE,
      seed: RNG_SEED,
      reset: DO_RESET,
      asOf: AS_OF_YMD
    })
  );

  const rng = mulberry32(RNG_SEED);
  const asOfStart = parseBogotaDateOnlyToUTC(AS_OF_YMD);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const roles = await prisma.role.findMany();
  const roleIdByName = new Map<RoleName, string>();
  for (const r of roles) {
    roleIdByName.set(r.name, r.id);
  }
  const need: RoleName[] = ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"];
  for (const n of need) {
    if (!roleIdByName.has(n)) {
      throw new Error(`Role ${n} missing. Run prisma migrate + seed first.`);
    }
  }

  if (DO_RESET) {
    await deletePlatformTestData();
  }

  let globalDocSeq = 7_100_000_000;
  const nextDoc = (): string => {
    globalDocSeq += 1;
    return String(globalDocSeq);
  };

  const sampledLoanIds: string[] = [];
  let freqSampled: Record<LoanFrequency, boolean> = {
    DAILY: false,
    WEEKLY: false,
    BIWEEKLY: false,
    MONTHLY: false
  };

  for (let b = 0; b < NUM_BUSINESSES; b += 1) {
    const bizName = `${BUSINESS_PREFIX} Biz ${b + 1}`;
    const business = await prisma.business.create({
      data: {
        name: bizName,
        licenseStartsAt: new Date(Date.now() - 90 * 86400000),
        licenseEndsAt: new Date(Date.now() + 365 * 86400000)
      }
    });

    const adminRoleId = roleIdByName.get("ADMIN");
    const rmRoleId = roleIdByName.get("ROUTE_MANAGER");
    const clientRoleId = roleIdByName.get("CLIENT");
    if (!adminRoleId || !rmRoleId || !clientRoleId) {
      throw new Error("Required roles missing after validation.");
    }

    const admins: { id: string }[] = [];
    for (let a = 0; a < 2; a += 1) {
      const email = `plt-b${b}-adm${a}@load.plt`;
      const u = await prisma.user.create({
        data: {
          name: `Admin ${b + 1}.${a + 1}`,
          email,
          documentId: nextDoc(),
          phone: `300${String(b).padStart(2, "0")}${String(a).padStart(3, "0")}001`,
          passwordHash,
          businessId: business.id,
          roles: { create: { roleId: adminRoleId } }
        }
      });
      admins.push({ id: u.id });
    }

    const numManagers = randInt(rng, 6, 10);
    const managers: { id: string }[] = [];
    for (let m = 0; m < numManagers; m += 1) {
      const email = `plt-b${b}-rm${m}@load.plt`;
      const u = await prisma.user.create({
        data: {
          name: `Encargado B${b + 1}-R${m + 1}`,
          email,
          documentId: nextDoc(),
          phone: `301${String(b).padStart(2, "0")}${String(m).padStart(3, "0")}002`,
          passwordHash,
          businessId: business.id,
          roles: { create: { roleId: rmRoleId } }
        }
      });
      managers.push({ id: u.id });
    }

    const numRoutes = randInt(rng, 10, 15);
    const routeRows: { id: string; managerId: string }[] = [];
    for (let r = 0; r < numRoutes; r += 1) {
      const managerId = managers[r % managers.length]!.id;
      const route = await prisma.route.create({
        data: {
          name: `Ruta B${b + 1}-${r + 1}`,
          managerId,
          businessId: business.id,
          balance: new Prisma.Decimal(0)
        }
      });
      routeRows.push({ id: route.id, managerId });

      const credit = randInt(rng, 80_000_000, 200_000_000);
      await prisma.$transaction(async (tx) => {
        await tx.route.update({
          where: { id: route.id },
          data: { balance: { increment: credit } }
        });
        await tx.managerBalanceLog.create({
          data: {
            routeId: route.id,
            amount: credit,
            type: "CREDIT",
            reference: "platform-load-test initial credit",
            createdById: admins[0]!.id
          }
        });
      });
    }

    for (const route of routeRows) {
      const clientCreates: Prisma.UserCreateManyInput[] = [];
      for (let c = 0; c < CLIENTS_PER_ROUTE; c += 1) {
        clientCreates.push({
          name: `Cliente B${b + 1} ${route.id.slice(-4)}-${c + 1}`,
          email: `plt-b${b}-c-${route.id.slice(-6)}-${c}@client.plt`,
          documentId: nextDoc(),
          phone: `310${c % 10}000${String(c).padStart(4, "0")}`,
          passwordHash,
          businessId: business.id
        });
      }
      await prisma.user.createMany({ data: clientCreates });
      const createdClients = await prisma.user.findMany({
        where: { email: { startsWith: `plt-b${b}-c-${route.id.slice(-6)}-` } },
        select: { id: true },
        orderBy: { email: "asc" }
      });
      await prisma.userRole.createMany({
        data: createdClients.map((u) => ({ userId: u.id, roleId: clientRoleId }))
      });
      await prisma.routeClient.createMany({
        data: createdClients.map((u) => ({ routeId: route.id, clientId: u.id }))
      });

      let clientIdx = 0;
      for (const cl of createdClients) {
        const frequency = FREQUENCIES[clientIdx % FREQUENCIES.length]!;
        clientIdx += 1;

        let installmentCount: number;
        switch (frequency) {
          case "DAILY":
            installmentCount = randInt(rng, 18, 36);
            break;
          case "WEEKLY":
            installmentCount = randInt(rng, 10, 24);
            break;
          case "BIWEEKLY":
            installmentCount = randInt(rng, 8, 18);
            break;
          default:
            installmentCount = randInt(rng, 4, 12);
        }

        const principal = randInt(rng, 4, 80) * 50_000;
        const interestPercent = randInt(rng, 3, 10);
        const daysBack = randInt(rng, 40, 220);
        const startDate = new Date(asOfStart);
        startDate.setUTCDate(startDate.getUTCDate() - daysBack);

        const preview = calculateLoan({
          principal,
          interestRate: interestPercent / 100,
          installmentCount,
          frequency,
          startDate,
          excludeWeekends: false
        });

        const termDays = Math.max(
          1,
          Math.round((preview.endDate.getTime() - startDate.getTime()) / 86400000)
        );

        const loan = await prisma.$transaction(async (tx) => {
          const row = await tx.loan.create({
            data: {
              routeId: route.id,
              clientId: cl.id,
              managerId: route.managerId,
              principal,
              interestRate: new Prisma.Decimal(interestPercent / 100),
              termDays,
              frequency: frequency as Frequency,
              installmentCount,
              installmentAmount: preview.installmentAmount,
              totalAmount: preview.totalAmount,
              totalInterest: preview.totalInterest,
              startDate,
              endDate: preview.endDate,
              status: "ACTIVE" as LoanStatus
            }
          });
          await tx.paymentSchedule.createMany({
            data: preview.schedule.map((item) => ({
              loanId: row.id,
              installmentNumber: item.installmentNumber,
              dueDate: item.dueDate,
              amount: item.amount,
              status: "PENDING" as const
            }))
          });
          return row;
        });

        if (!freqSampled[frequency]) {
          freqSampled[frequency] = true;
          sampledLoanIds.push(loan.id);
        }
        if (sampledLoanIds.length < 12 && rng() < 0.05) {
          sampledLoanIds.push(loan.id);
        }

        const payRoll = rng();
        const actorRoles = ["ROUTE_MANAGER"];
        if (payRoll < 0.35) {
          const schedules = await prisma.paymentSchedule.findMany({
            where: { loanId: loan.id },
            orderBy: { installmentNumber: "asc" }
          });
          const payCount = Math.min(schedules.length, randInt(rng, 1, 3));
          for (let p = 0; p < payCount; p += 1) {
            const sch = schedules[p];
            if (!sch) break;
            const target = decimalToNumber(sch.amount);
            const payAmt =
              p === payCount - 1 && rng() < 0.15 ? Math.max(1, Math.floor(target / 2)) : target;
            try {
              await createPayment(
                {
                  loanId: loan.id,
                  scheduleId: sch.id,
                  amount: payAmt,
                  method: rng() < 0.5 ? "CASH" : "TRANSFER",
                  notes: "platform-load-test"
                },
                route.managerId,
                actorRoles,
                business.id
              );
            } catch (e) {
              console.warn(`Payment skipped loan=${loan.id}:`, (e as Error).message);
            }
          }
        }
      }
    }

    console.log(
      `Business ${b + 1}/${NUM_BUSINESSES} OK: ${numManagers} managers, ${numRoutes} routes, ~${CLIENTS_PER_ROUTE} clients/route`
    );
  }

  const overdueCount = await markPastDueAsOverdue(asOfStart);
  console.log(`Marked ${overdueCount} installment row(s) as OVERDUE (due before ${AS_OF_YMD}).`);
  recordCheck("overdue rows created", overdueCount > 0, `count=${overdueCount}`);

  const managers = await prisma.user.findMany({
    where: {
      AND: [{ email: { endsWith: "@load.plt" } }, { email: { contains: "-rm" } }],
      roles: { some: { role: { name: "ROUTE_MANAGER" } } }
    },
    select: { id: true }
  });

  const liqDates = [getBogotaTodayYmd(), AS_OF_YMD.slice(0, 7) + "-01"];
  let liqOk = 0;
  for (const m of managers) {
    for (const d of liqDates) {
      try {
        await submitLiquidationReview(m.id, d, "Cierre generado por platform-load-test");
        liqOk += 1;
      } catch (e) {
        console.warn(`Liquidation skip manager=${m.id} date=${d}:`, (e as Error).message);
      }
    }
  }
  recordCheck("liquidation submissions", liqOk > 0, `submissions=${liqOk}`);

  const uniqSample = [...new Set(sampledLoanIds)];
  for (const id of uniqSample.slice(0, 40)) {
    await assertLoanScheduleMath(id);
  }

  const totalLoans = await prisma.loan.count({
    where: { route: { business: { name: { startsWith: `${BUSINESS_PREFIX} ` } } } }
  });
  recordCheck("loans created", totalLoans > 0, `totalLoans=${totalLoans}`);

  const byFreq = await prisma.loan.groupBy({
    by: ["frequency"],
    where: { route: { business: { name: { startsWith: `${BUSINESS_PREFIX} ` } } } },
    _count: { id: true }
  });
  const freqLines = byFreq.map((x) => `${x.frequency}:${x._count.id}`).join(", ");
  const expectedDistinctFreqs = Math.min(4, CLIENTS_PER_ROUTE);
  recordCheck(
    "frequency coverage (all 4 when clients/route ≥ 4)",
    byFreq.length >= expectedDistinctFreqs,
    `${freqLines} (distinct=${byFreq.length}, need≥${expectedDistinctFreqs})`
  );

  const failed = checks.filter((c) => !c.ok).length;
  console.log("\n=== Summary ===");
  console.table(
    checks.map((c) => ({ check: c.name, status: c.ok ? "PASS" : "FAIL", detail: c.detail ?? "" }))
  );
  console.log(`Login sample: plt-b0-adm0@load.plt / ${PASSWORD}`);
  console.log(`Route manager: plt-b0-rm0@load.plt / ${PASSWORD}`);
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll recorded checks passed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
