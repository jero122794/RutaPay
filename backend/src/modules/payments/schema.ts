// backend/src/modules/payments/schema.ts
import { z } from "zod";

export const loanIdParamsSchema = z.object({
  loanId: z.string().cuid()
});

export const createPaymentSchema = z.object({
  loanId: z.string().cuid(),
  scheduleId: z.string().cuid().optional(),
  amount: z.number().int().positive(),
  notes: z.string().max(300).optional()
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
