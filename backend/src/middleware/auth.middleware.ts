// backend/src/middleware/auth.middleware.ts
import type { AppModule, RoleName } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { loadModulesForRoles } from "../shared/role-modules.js";

export const authGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    await request.jwtVerify();
    const payload = request.user;
    const roles = Array.isArray(payload.roles) ? (payload.roles as RoleName[]) : [];
    let modules: AppModule[] = Array.isArray(payload.modules) ? [...payload.modules] : [];

    // Legacy or short-lived tokens may omit modules; moduleGuard would 403. Recompute from roles + DB like refresh/login.
    if (modules.length === 0 && roles.length > 0) {
      modules = await loadModulesForRoles(roles);
    }

    request.authUser = {
      id: payload.sub,
      email: payload.email ?? "",
      roles: roles as string[],
      businessId: payload.businessId ?? null,
      modules
    };
  } catch {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
  }
};
