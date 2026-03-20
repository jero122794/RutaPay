// backend/src/app.ts
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { authRouter } from "./modules/auth/router.js";
import { clientsRouter } from "./modules/clients/router.js";
import { loansRouter } from "./modules/loans/router.js";
import { paymentsRouter } from "./modules/payments/router.js";
import { routesRouter } from "./modules/routes/router.js";
import { treasuryRouter } from "./modules/treasury/router.js";
import { notificationsRouter } from "./modules/notifications/router.js";
import { usersRouter } from "./modules/users/router.js";
import { env } from "./shared/env.js";
import { errorHandler } from "./middleware/error.middleware.js";

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify();

  await app.register(helmet);
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

  await app.register(
    async (scope) => {
      await scope.register(rateLimit, {
        max: 10,
        timeWindow: "1 minute"
      });
      await scope.register(authRouter);
    },
    { prefix: "/api/auth" }
  );

  await app.register(usersRouter, { prefix: "/api/users" });
  await app.register(routesRouter, { prefix: "/api/routes" });
  await app.register(clientsRouter, { prefix: "/api/clients" });
  await app.register(loansRouter, { prefix: "/api/loans" });
  await app.register(paymentsRouter, { prefix: "/api/payments" });
  await app.register(treasuryRouter, { prefix: "/api/treasury" });
  await app.register(notificationsRouter, { prefix: "/api/notifications" });

  app.get("/api/health", async () => ({
    data: {
      status: "ok"
    }
  }));

  return app;
};
