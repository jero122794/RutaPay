// backend/src/modules/businesses/schema.ts
import { z } from "zod";

export const businessIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const businessMemberUserParamsSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid()
});

export const createBusinessSchema = z.object({
  name: z.string().min(2).max(120)
});

export const updateBusinessSchema = z.object({
  name: z.string().min(2).max(120)
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
export type AssignBusinessMemberInput = z.infer<typeof assignBusinessMemberSchema>;
export type CreateFirstBusinessAdminInput = z.infer<typeof createFirstBusinessAdminSchema>;
