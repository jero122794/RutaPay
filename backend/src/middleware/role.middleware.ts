// backend/src/middleware/role.middleware.ts
import type { FastifyReply, FastifyRequest } from "fastify";

export const roleGuard =
  (allowedRoles: string[]) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userRoles: string[] = request.authUser?.roles ?? [];
    const hasRole = userRoles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Insufficient permissions."
      });
    }
  };
