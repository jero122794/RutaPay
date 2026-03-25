// backend/src/middleware/module.middleware.ts
import type { AppModule } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

export const moduleGuard =
  (required: AppModule) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const roles = request.authUser?.roles ?? [];
    if (roles.includes("SUPER_ADMIN")) {
      return;
    }

    const modules = request.authUser?.modules ?? [];
    if (!modules.includes(required)) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "No tienes acceso a este módulo."
      });
    }
  };
