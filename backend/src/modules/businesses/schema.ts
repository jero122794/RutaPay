// backend/src/modules/businesses/schema.ts
import { z } from "zod";

export const businessIdParamsSchema = z.object({
  // Business ids may be seeded as stable strings (e.g. "seed-business-demo"), not always cuid().
  id: z.string().min(1)
});

export const businessMemberUserParamsSchema = z.object({
  id: z.string().min(1),
  userId: z.string().cuid()
});

export const createBusinessSchema = z.object({
  name: z.string().min(2).max(120)
});

export const updateBusinessSchema = z.object({
  name: z.string().min(2).max(120)
});

export const setBusinessLicenseSchema = z
  .object({
    months: z.number().int().positive().optional(),
    years: z.number().int().positive().optional()
  })
  .refine((data) => Boolean(data.months) !== Boolean(data.years), {
    message: "Provide either months or years (not both)."
  });

export const assignBusinessMemberSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["ADMIN", "ROUTE_MANAGER", "CLIENT"])
});

const firstAdminPasswordSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
  .regex(/[a-z]/, "Password must include at least one lowercase letter.")
  .regex(/[0-9]/, "Password must include at least one number.")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.");

export const createFirstBusinessAdminSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: firstAdminPasswordSchema
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type SetBusinessLicenseInput = z.infer<typeof setBusinessLicenseSchema>;
export type AssignBusinessMemberInput = z.infer<typeof assignBusinessMemberSchema>;
export type CreateFirstBusinessAdminInput = z.infer<typeof createFirstBusinessAdminSchema>;
