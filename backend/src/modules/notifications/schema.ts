// backend/src/modules/notifications/schema.ts
import { z } from "zod";

export const subscribeSchema = z.object({
  endpoint: z.string().min(10),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10)
  })
});

export const notificationIdParamsSchema = z.object({
  id: z.string().min(1)
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
