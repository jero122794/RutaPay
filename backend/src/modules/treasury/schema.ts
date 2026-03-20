// backend/src/modules/treasury/schema.ts
import { z } from "zod";

export const routeIdParamsSchema = z.object({
  routeId: z.string().cuid()
});

export const managerIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const creditRouteSchema = z.object({
  routeId: z.string().cuid(),
  amount: z.number().int().positive(),
  reference: z.string().max(200).optional()
});

export type CreditRouteInput = z.infer<typeof creditRouteSchema>;
