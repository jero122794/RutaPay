// backend/src/shared/env.ts
import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    VAPID_PUBLIC_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    VAPID_EMAIL: z.string().regex(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: "VAPID_EMAIL must be a valid mailto address."
    }),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    CORS_ORIGIN: z.string().url()
  })
  .superRefine((data, ctx) => {
    const isProd = data.NODE_ENV === "production";
    const minJwt = isProd ? 32 : 16;
    if (data.JWT_SECRET.length < minJwt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: isProd
          ? "JWT_SECRET debe tener al menos 32 caracteres en producción."
          : "JWT_SECRET debe tener al menos 16 caracteres en desarrollo (en producción: 32)."
      });
    }
    if (data.JWT_REFRESH_SECRET.length < minJwt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: isProd
          ? "JWT_REFRESH_SECRET debe tener al menos 32 caracteres en producción."
          : "JWT_REFRESH_SECRET debe tener al menos 16 caracteres en desarrollo (en producción: 32)."
      });
    }

    if (isProd) {
      const u = data.DATABASE_URL.toLowerCase();
      // Railway private DB host (postgres.railway.internal) is VPC-only; SSL is not required on the URL.
      const isRailwayPrivateDb = u.includes("railway.internal");
      const hasPgSslHint =
        u.includes("sslmode=require") ||
        u.includes("ssl=true") ||
        u.includes("sslmode=verify-full");
      if (!isRailwayPrivateDb && !hasPgSslHint) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message:
            "En producción DATABASE_URL debe usar SSL (p. ej. ?sslmode=require) para conexión segura a PostgreSQL."
        });
      }
      if (data.CORS_ORIGIN.includes("*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: "CORS_ORIGIN no puede ser comodín en producción."
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
