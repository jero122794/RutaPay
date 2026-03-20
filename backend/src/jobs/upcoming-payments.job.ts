// backend/src/jobs/upcoming-payments.job.ts
import cron from "node-cron";
import { prisma } from "../shared/prisma.js";
import { sendPushToUser } from "../modules/notifications/service.js";

const formatDay = (d: Date): string => d.toISOString().slice(0, 10);

export const registerUpcomingJobs = (): void => {
  cron.schedule("0 7 * * *", async (): Promise<void> => {
    const now = new Date();
    const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrowStart.setUTCHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

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
        const body = `Próxima cuota el ${formatDay(item.dueDate)}.`;
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

