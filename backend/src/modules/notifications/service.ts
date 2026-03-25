// backend/src/modules/notifications/service.ts
import type { PushSubscription as PrismaPushSubscription } from "@prisma/client";
import webpush from "web-push";
import type { SubscribeInput } from "./schema.js";
import { prisma } from "../../shared/prisma.js";
import { redis } from "../../shared/redis.js";
import { env } from "../../shared/env.js";

let vapidConfigured = false;
try {
  webpush.setVapidDetails(env.VAPID_EMAIL, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
} catch {
  // In dev, it is possible that dummy keys are present.
  vapidConfigured = false;
}

type NotificationType = "OVERDUE_TODAY" | "UPCOMING_TOMORROW" | "CRITICAL_OVERDUE";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
}

interface NotificationListResponse {
  data: NotificationItem[];
  total: number;
}

interface ScheduleForAlert {
  id: string;
  dueDate: Date;
  status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
  loanId: string;
  clientId: string;
  clientName: string;
  managerId: string;
}

const getNotifReadKey = (userId: string, notificationId: string): string => {
  return `notif:read:${userId}:${notificationId}`;
};

const isScheduleOverdue = (scheduleDue: Date, now: Date): boolean => {
  return scheduleDue.getTime() < now.getTime();
};

const getBogotaDayBoundsUTC = (offsetDays: number): { start: Date; end: Date } => {
  // Bogota is UTC-5 without DST. We build bounds by shifting by +5h in UTC.
  const now = new Date();
  const shifted = new Date(now.getTime() + 5 * 60 * 60 * 1000);

  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  shifted.setUTCHours(0, 0, 0, 0);

  const start = new Date(shifted.getTime() - 5 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
};

const mapToScheduleForAlert = (item: {
  id: string;
  dueDate: Date;
  status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
  loanId: string;
  loan: { clientId: string; managerId: string; client: { name: string } };
}): ScheduleForAlert => ({
  id: item.id,
  dueDate: item.dueDate,
  status: item.status,
  loanId: item.loanId,
  clientId: item.loan.clientId,
  clientName: item.loan.client.name,
  managerId: item.loan.managerId
});

const ensureActorScope = async (actorId: string, actorRoles: string[]): Promise<"CLIENT" | "ROUTE_MANAGER" | "ADMIN"> => {
  if (actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN")) {
    return "ADMIN";
  }
  if (actorRoles.includes("ROUTE_MANAGER")) {
    return "ROUTE_MANAGER";
  }
  return "CLIENT";
};

const listSubscriptionsByUserId = async (userId: string): Promise<PrismaPushSubscription[]> => {
  return prisma.pushSubscription.findMany({
    where: { userId }
  });
};

const toWebPushSubscription = (sub: PrismaPushSubscription): webpush.PushSubscription => ({
  endpoint: sub.endpoint,
  keys: {
    p256dh: sub.p256dh,
    auth: sub.auth
  },
  expirationTime: null
});

export const subscribe = async (actorId: string, input: SubscribeInput): Promise<void> => {
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });

  if (existing) {
    // If endpoint exists, bind it to current user for safety.
    await prisma.pushSubscription.update({
      where: { id: existing.id },
      data: {
        userId: actorId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth
      }
    });
    return;
  }

  await prisma.pushSubscription.create({
    data: {
      userId: actorId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth
    }
  });
};

export const markRead = async (actorId: string, notificationId: string): Promise<void> => {
  await redis.set(getNotifReadKey(actorId, notificationId), "1");
};

const buildNotifications = async (
  actorId: string,
  actorRoles: string[]
): Promise<Omit<NotificationListResponse, "total">> => {
  const scope = await ensureActorScope(actorId, actorRoles);
  const now = new Date();

  const today = getBogotaDayBoundsUTC(0);
  const tomorrow = getBogotaDayBoundsUTC(1);

  const whereBase: {
    statusIn: Array<"PENDING" | "OVERDUE" | "PARTIAL">;
  } = { statusIn: ["PENDING", "OVERDUE", "PARTIAL"] };

  const scheduleWhere =
    scope === "CLIENT"
      ? {
          loan: { clientId: actorId }
        }
      : scope === "ROUTE_MANAGER"
        ? {
            loan: { managerId: actorId }
          }
        : {};

  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      ...scheduleWhere,
      status: { in: whereBase.statusIn },
      dueDate: { lte: tomorrow.end }
    },
    select: {
      id: true,
      dueDate: true,
      status: true,
      loanId: true,
      loan: {
        select: {
          clientId: true,
          managerId: true,
          client: {
            select: { name: true }
          }
        }
      }
    }
  });

  const scheduleItems = schedules.map(mapToScheduleForAlert);

  // Overdue today: dueDate < now OR schedule.status=OVERDUE, within today range (Bogota).
  const overdueToday = scheduleItems.filter(
    (s) => s.status === "OVERDUE" || (s.status !== "PAID" && isScheduleOverdue(s.dueDate, now) && s.dueDate >= today.start && s.dueDate < today.end)
  );

  // Upcoming tomorrow: dueDate in tomorrow range, not paid.
  const upcomingTomorrow = scheduleItems.filter(
    (s) => s.status === "PENDING" && s.dueDate >= tomorrow.start && s.dueDate < tomorrow.end
  );

  const criticalOverdueClientsMap = new Map<string, number>();
  for (const s of scheduleItems) {
    if (s.status === "OVERDUE") {
      criticalOverdueClientsMap.set(s.clientId, (criticalOverdueClientsMap.get(s.clientId) ?? 0) + 1);
    }
  }
  const criticalClients = Array.from(criticalOverdueClientsMap.entries())
    .filter(([, count]) => count >= 2)
    .map(([clientId]) => clientId);

  const items: Array<Omit<NotificationItem, "read">> = [];
  for (const s of overdueToday) {
    items.push({
      id: s.id,
      type: "OVERDUE_TODAY",
      title: "Cuota vencida",
      message: `Tienes una cuota vencida para el cliente ${s.clientName}.`,
      createdAt: s.dueDate
    });
  }
  for (const s of upcomingTomorrow) {
    items.push({
      id: s.id,
      type: "UPCOMING_TOMORROW",
      title: "Cuota próxima",
      message: `Próxima cuota el ${s.dueDate.toISOString().slice(0, 10)} para el cliente ${s.clientName}.`,
      createdAt: s.dueDate
    });
  }

  for (const clientId of criticalClients) {
    const clientName =
      scheduleItems.find((row) => row.clientId === clientId)?.clientName ?? "Cliente";
    items.push({
      id: `critical:${clientId}`,
      type: "CRITICAL_OVERDUE",
      title: "Mora crítica",
      message: `El cliente ${clientName} tiene 2 o más cuotas en mora.`,
      createdAt: now
    });
  }

  // De-duplicate by id
  const uniqueById = new Map<string, Omit<NotificationItem, "read">>();
  for (const it of items) {
    uniqueById.set(it.id, it);
  }

  const unique = Array.from(uniqueById.values());
  unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const notifWithRead = await Promise.all(
    unique.map(async (it) => {
      const readValue = await redis.get(getNotifReadKey(actorId, it.id));
      const read = readValue === "1";
      return { ...it, read };
    })
  );

  return { data: notifWithRead };
};

export const listNotifications = async (actorId: string, actorRoles: string[]): Promise<NotificationListResponse> => {
  const result = await buildNotifications(actorId, actorRoles);
  return {
    data: result.data,
    total: result.data.length
  };
};

export const sendPushToUser = async (userId: string, payload: { title: string; body: string; data?: Record<string, string> }): Promise<void> => {
  const subscriptions = await listSubscriptionsByUserId(userId);
  if (subscriptions.length === 0) return;

  if (!vapidConfigured) return;

  const payloadForWebPush = {
    notification: {
      title: payload.title,
      body: payload.body
    },
    data: payload.data ?? {}
  };

  await Promise.all(
    subscriptions.map(async (sub) => {
      const webSub = toWebPushSubscription(sub);
      try {
        await webpush.sendNotification(webSub, JSON.stringify(payloadForWebPush));
      } catch {
        // Avoid crashing cron due to one failing subscription.
      }
    })
  );
};
