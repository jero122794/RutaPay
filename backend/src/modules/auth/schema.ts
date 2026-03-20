// backend/src/modules/auth/schema.ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(20).optional(),
  routeId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().cuid().optional()
  ),
  password: z
    .string()
    .min(8)
    .max(64)
    .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
    .regex(/[a-z]/, "Password must include at least one lowercase letter.")
    .regex(/[0-9]/, "Password must include at least one number.")
    .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.")
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(64)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
