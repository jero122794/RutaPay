// backend/src/modules/auth/router.ts
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  listRegisterRoutesController,
  loginController,
  logoutController,
  refreshController,
  registerController
} from "./controller.js";

export const authRouter = async (app: FastifyInstance): Promise<void> => {
  app.get("/register/routes", listRegisterRoutesController);

  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 3,
      timeWindow: "1 hour",
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Demasiados registros desde esta IP. Espere 1 hora."
      })
    });
    scope.post("/register", registerController);
  });

  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 5,
      timeWindow: "15 minutes",
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Demasiados intentos de inicio de sesión. Espere 15 minutos."
      })
    });
    scope.post("/login", loginController);
  });

  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 30,
      timeWindow: "1 minute",
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Demasiadas solicitudes. Intente de nuevo en un minuto."
      })
    });
    scope.post("/refresh", refreshController);
    scope.post("/logout", logoutController);
  });
};
