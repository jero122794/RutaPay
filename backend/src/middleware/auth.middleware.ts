// backend/src/middleware/auth.middleware.ts
import type { FastifyReply, FastifyRequest } from "fastify";

export const authGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    await request.jwtVerify();
    const payload = request.user;
    request.authUser = {
      id: payload.sub,
      email: payload.email ?? "",
      roles: payload.roles,
      businessId: payload.businessId ?? null,
      modules: payload.modules ?? []
    };
  } catch {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
  }
};
