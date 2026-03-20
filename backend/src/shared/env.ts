// backend/src/shared/env.ts
import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_EMAIL: z.string().regex(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: "VAPID_EMAIL must be a valid mailto address."
  }),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().url()
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
