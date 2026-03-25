// backend/src/modules/loans/schema.ts
import { z } from "zod";

export const loanIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const createLoanSchema = z.object({
  routeId: z.string().cuid(),
  clientId: z.string().cuid(),
  managerId: z.string().cuid().optional(),
  principal: z.number().int().positive(),
  interestRate: z.number().int().positive(),
  installmentCount: z.number().int().positive(),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  startDate: z.coerce.date(),
  excludeWeekends: z.boolean().optional().default(false)
});

export const calculateLoanSchema = createLoanSchema.omit({
  routeId: true,
  clientId: true,
  managerId: true
});

export const updateLoanStatusSchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "DEFAULTED", "RESTRUCTURED"])
});

export const updateLoanTermsSchema = z.object({
  interestRate: z.number().int().positive(),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"])
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type CalculateLoanInput = z.infer<typeof calculateLoanSchema>;
export type UpdateLoanStatusInput = z.infer<typeof updateLoanStatusSchema>;
export type UpdateLoanTermsInput = z.infer<typeof updateLoanTermsSchema>;
