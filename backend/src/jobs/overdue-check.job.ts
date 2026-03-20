// backend/src/jobs/overdue-check.job.ts
import cron from "node-cron";
import { prisma } from "../shared/prisma.js";
import { sendPushToUser } from "../modules/notifications/service.js";

export const registerOverdueCheckJob = (): void => {
  cron.schedule("0 6 * * *", async (): Promise<void> => {
    const now = new Date();

    const dueToUpdate = await prisma.paymentSchedule.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: { lt: now }
      },
      select: {
        id: true,
        dueDate: true,
        loan: {
          select: {
            clientId: true,
            managerId: true
          }
        }
      }
    });

    if (dueToUpdate.length === 0) return;

    const ids = dueToUpdate.map((x) => x.id);
    await prisma.paymentSchedule.updateMany({
      where: { id: { in: ids } },
      data: { status: "OVERDUE" }
    });

    // Notify both client and route manager.
    await Promise.all(
      dueToUpdate.map(async (item) => {
        const body = `Cuota vencida el ${item.dueDate.toISOString().slice(0, 10)}.`;
        await Promise.all([
          sendPushToUser(item.loan.clientId, { title: "Cuota vencida", body, data: { id: item.id } }),
          sendPushToUser(item.loan.managerId, { title: "Cuota vencida", body, data: { id: item.id } })
        ]);
      })
    );
  });
};

