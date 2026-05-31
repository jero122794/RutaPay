// backend/src/modules/payments/schema.ts
import { z } from "zod";

export const loanIdParamsSchema = z.object({
  loanId: z.string().cuid()
});

export const createPaymentSchema = z.object({
  loanId: z.string().cuid(),
  scheduleId: z.string().cuid().optional(),
  amount: z.number().int().positive(),
  // FULL = pay interest first then capital; INTEREST/CAPITAL = target a single bucket.
  allocation: z.enum(["FULL", "INTEREST", "CAPITAL"]).default("FULL"),
  method: z.enum(["CASH", "TRANSFER"]),
  notes: z.string().max(300).optional()
});

export const paymentIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const reversePaymentSchema = z.object({
  reason: z.string().max(300).optional()
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
