// backend/src/middleware/auth.middleware.ts
import type { FastifyReply, FastifyRequest } from "fastify";

export const authGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    await request.jwtVerify();
    request.authUser = {
      id: request.user.sub,
      email: request.user.email,
      roles: request.user.roles
    };
  } catch {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
  }
};
