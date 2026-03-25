// backend/src/modules/clients/schema.ts
import { z } from "zod";

export const clientIdParamsSchema = z.object({
  id: z.string().cuid()
});

export const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
  documentId: z.string().min(5).max(30),
  email: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().email().optional()
  ),
  address: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().max(160).optional()
  ),
  description: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().max(300).optional()
  ),
  password: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z
      .string()
      .min(8)
      .max(64)
      .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
      .regex(/[a-z]/, "Password must include at least one lowercase letter.")
      .regex(/[0-9]/, "Password must include at least one number.")
      .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.")
      .optional()
  ),
  routeId: z.string().cuid()
});

export const updateClientSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().email().optional()
  ),
  phone: z.string().min(7).max(20).optional(),
  address: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().max(160).optional()
  ),
  description: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().max(300).optional()
  ),
  documentId: z.string().min(5).max(30).optional(),
  isActive: z.boolean().optional(),
  password: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z
      .string()
      .min(8)
      .max(64)
      .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
      .regex(/[a-z]/, "Password must include at least one lowercase letter.")
      .regex(/[0-9]/, "Password must include at least one number.")
      .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.")
      .optional()
  )
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
