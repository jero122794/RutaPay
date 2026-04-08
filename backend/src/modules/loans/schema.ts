// backend/src/modules/loans/schema.ts
import { z } from "zod";
import { parseBogotaDateOnlyToUTC } from "../../shared/bogota-date.js";

/** Avoids JS/Zod treating YYYY-MM-DD as UTC midnight (wrong calendar day in CO). */
const loanStartDateSchema = z.preprocess((val: unknown) => {
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === "string") {
    const t = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return parseBogotaDateOnlyToUTC(t);
    }
  }
  return val;
}, z.coerce.date());

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
  startDate: loanStartDateSchema,
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
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  installmentCount: z.number().int().positive().optional()
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type CalculateLoanInput = z.infer<typeof calculateLoanSchema>;
export type UpdateLoanStatusInput = z.infer<typeof updateLoanStatusSchema>;
export type UpdateLoanTermsInput = z.infer<typeof updateLoanTermsSchema>;
