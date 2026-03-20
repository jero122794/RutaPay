// backend/src/modules/users/schema.ts
import { z } from "zod";

export const userIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(20).optional(),
  password: z
    .string()
    .min(8)
    .max(64)
    .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
    .regex(/[a-z]/, "Password must include at least one lowercase letter.")
    .regex(/[0-9]/, "Password must include at least one number.")
    .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.")
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().min(7).max(20).optional(),
  isActive: z.boolean().optional()
});

export const assignRolesSchema = z.object({
  roles: z.array(z.enum(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"])).min(1)
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
