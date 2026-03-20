// backend/src/modules/routes/schema.ts
import { z } from "zod";

export const routeIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const createRouteSchema = z.object({
  name: z.string().min(2).max(120),
  managerId: z.string().cuid()
});

export const updateRouteSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  managerId: z.string().cuid().optional()
});

export const addBalanceSchema = z.object({
  amount: z.number().int().positive(),
  reference: z.string().max(200).optional()
});

export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
export type AddBalanceInput = z.infer<typeof addBalanceSchema>;
