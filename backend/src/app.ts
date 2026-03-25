// backend/src/app.ts
import { createHash } from "crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { authRouter } from "./modules/auth/router.js";
import { businessesRouter } from "./modules/businesses/router.js";
import { clientsRouter } from "./modules/clients/router.js";
import { loansRouter } from "./modules/loans/router.js";
import { paymentsRouter } from "./modules/payments/router.js";
import { routesRouter } from "./modules/routes/router.js";
import { treasuryRouter } from "./modules/treasury/router.js";
import { notificationsRouter } from "./modules/notifications/router.js";
import { roleModulesRouter } from "./modules/role-modules/router.js";
import { usersRouter } from "./modules/users/router.js";
import { env } from "./shared/env.js";
import { redis } from "./shared/redis.js";
import { errorHandler } from "./middleware/error.middleware.js";

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
    disableRequestLogging: false
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy:
      env.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"]
            }
          }
        : false,
    hsts:
      env.NODE_ENV === "production"
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          }
        : false,
    noSniff: true,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: "1 minute"
  });

  app.setErrorHandler(errorHandler);

  // Idempotency success payload is stored in createPaymentController (onSend + async Redis breaks Fastify reply lifecycle).
  app.addHook("onResponse", async (request, reply) => {
    const key = request.idempotencyRedisKey;
    if (key && reply.statusCode !== undefined && reply.statusCode >= 400) {
      try {
        await redis.del(key);
      } catch {
        // ignore
      }
    }
  });

  app.get("/api/health", async (_request, reply) => {
    reply.send({ status: "ok" });
  });

  await app.register(authRouter, { prefix: "/api/auth" });

  await app.register(
    async (scope) => {
      await scope.register(rateLimit, {
        max: 100,
        timeWindow: "1 minute",
        keyGenerator: (request) => {
          const authz = request.headers.authorization;
          if (typeof authz === "string" && authz.startsWith("Bearer ")) {
            const token = authz.slice(7);
            const h = createHash("sha256").update(token).digest("hex").slice(0, 32);
            return `u:${h}`;
          }
          return `ip:${request.ip}`;
        },
        errorResponseBuilder: () => ({
          statusCode: 429,
          error: "Too Many Requests",
          message: "Demasiadas solicitudes. Intente de nuevo en un minuto."
        })
      });
      await scope.register(usersRouter, { prefix: "/users" });
      await scope.register(businessesRouter, { prefix: "/businesses" });
      await scope.register(roleModulesRouter, { prefix: "/role-modules" });
      await scope.register(routesRouter, { prefix: "/routes" });
      await scope.register(clientsRouter, { prefix: "/clients" });
      await scope.register(loansRouter, { prefix: "/loans" });
      await scope.register(paymentsRouter, { prefix: "/payments" });
      await scope.register(treasuryRouter, { prefix: "/treasury" });
      await scope.register(notificationsRouter, { prefix: "/notifications" });
    },
    { prefix: "/api" }
  );

  return app;
};
