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

export const liquidationQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const liquidationReviewsListQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n): n is 10 | 20 | 50 | 100 => [10, 20, 50, 100].includes(n), {
      message: "limit must be 10, 20, 50, or 100"
    })
    .default(10)
});

export const liquidationReviewDateBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  managerNote: z.string().max(500).optional()
});

export const liquidationReviewApproveBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviewNote: z.string().max(500).optional()
});

export const liquidationReviewRejectBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(3).max(500)
});

export const reviewManagerParamsSchema = z.object({
  managerId: z.string().cuid()
});

export type CreditRouteInput = z.infer<typeof creditRouteSchema>;
export type LiquidationQueryInput = z.infer<typeof liquidationQuerySchema>;
