// backend/src/jobs/upcoming-payments.job.ts
import cron from "node-cron";
import { prisma } from "../shared/prisma.js";
import { sendPushToUser } from "../modules/notifications/service.js";
import { bogotaDayBoundsUtc, getBogotaTodayYmd } from "../shared/bogota-day.js";

const formatDay = (d: Date): string => d.toISOString().slice(0, 10);

const addDaysYmd = (ymd: string, deltaDays: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const utcMs = Date.UTC(y, mo - 1, d + deltaDays, 0, 0, 0, 0);
  return new Date(utcMs).toISOString().slice(0, 10);
};

export const registerUpcomingJobs = (): void => {
  cron.schedule("0 7 * * *", async (): Promise<void> => {
    const todayYmd = getBogotaTodayYmd();
    const tomorrowYmd = addDaysYmd(todayYmd, 1);
    const { start: tomorrowStart, endExclusive: tomorrowEnd } = bogotaDayBoundsUtc(tomorrowYmd);

    const tomorrowSchedules = await prisma.paymentSchedule.findMany({
      where: {
        status: "PENDING",
        dueDate: { gte: tomorrowStart, lt: tomorrowEnd }
      },
      select: {
        id: true,
        dueDate: true,
        loan: { select: { clientId: true, managerId: true } }
      }
    });

    if (tomorrowSchedules.length === 0) return;

    await Promise.all(
      tomorrowSchedules.map(async (item) => {
        const body = `Próxima cuota el ${tomorrowYmd}.`;
        await Promise.all([
          sendPushToUser(item.loan.clientId, {
            title: "Cuota próxima",
            body,
            data: { id: item.id }
          }),
          sendPushToUser(item.loan.managerId, {
            title: "Cuota próxima",
            body,
            data: { id: item.id }
          })
        ]);
      })
    );
  });

  cron.schedule("0 8 * * *", async (): Promise<void> => {
    const now = new Date();
    const overdueSchedules = await prisma.paymentSchedule.findMany({
      where: {
        status: "OVERDUE",
        dueDate: { lt: now }
      },
      select: {
        id: true,
        loan: { select: { clientId: true } }
      }
    });

    const counts = new Map<string, number>();
    for (const s of overdueSchedules) {
      counts.set(s.loan.clientId, (counts.get(s.loan.clientId) ?? 0) + 1);
    }

    const criticalClientIds = Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([clientId]) => clientId);

    await Promise.all(
      criticalClientIds.map(async (clientId) => {
        await sendPushToUser(clientId, {
          title: "Mora crítica",
          body: "Tienes 2 o más cuotas en mora.",
          data: { id: `critical:${clientId}` }
        });
      })
    );
  });

  cron.schedule("0 9 * * *", async (): Promise<void> => {
    const routes = await prisma.route.findMany({
      select: { id: true, managerId: true, balance: true }
    });

    const lowBalancePromises = routes.map(async (route) => {
      const creditsAgg = await prisma.managerBalanceLog.aggregate({
        _sum: { amount: true },
        where: {
          routeId: route.id,
          type: "CREDIT"
        }
      });

      const totalCredits = creditsAgg._sum.amount ? Number(creditsAgg._sum.amount.toString()) : 0;
      if (totalCredits <= 0) return;

      // 20% threshold using integer math: threshold = totalCredits / 5
      const threshold = Math.round(totalCredits / 5);
      const currentBalance = Number(route.balance.toString());

      if (currentBalance < threshold) {
        await sendPushToUser(route.managerId, {
          title: "Saldo bajo",
          body: "Tu saldo disponible está por debajo del 20% del inicial.",
          data: { id: `low-balance:${route.id}` }
        });
      }
    });

    await Promise.all(lowBalancePromises);
  });
};

