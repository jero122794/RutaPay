// backend/src/middleware/auth.middleware.ts
import type { AppModule, RoleName } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { assertBusinessLicenseActiveForOperationalRoles } from "../shared/business-license.js";
import { loadModulesForRoles } from "../shared/role-modules.js";
import { env } from "../shared/env.js";

export const authGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authz = request.headers.authorization;
    if (typeof authz !== "string" || !authz.startsWith("Bearer ")) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required."
      });
    }

    const token = authz.slice(7);
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown;
    if (!decoded || typeof decoded !== "object") {
      throw new Error("Invalid token.");
    }
    const payload = decoded as {
      sub?: unknown;
      email?: unknown;
      roles?: unknown;
      businessId?: unknown;
      modules?: unknown;
    };

    const roles = Array.isArray(payload.roles) ? (payload.roles as RoleName[]) : [];
    let modules: AppModule[] = Array.isArray(payload.modules) ? (payload.modules as AppModule[]) : [];

    // Legacy or short-lived tokens may omit modules; moduleGuard would 403. Recompute from roles + DB like refresh/login.
    if (modules.length === 0 && roles.length > 0) {
      modules = await loadModulesForRoles(roles);
    }

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      throw new Error("Invalid token.");
    }

    request.authUser = {
      id: sub,
      email: typeof payload.email === "string" ? payload.email : "",
      roles: roles as string[],
      businessId: typeof payload.businessId === "string" ? payload.businessId : null,
      modules
    };

    if (request.authUser.businessId) {
      await assertBusinessLicenseActiveForOperationalRoles(request.authUser.businessId, request.authUser.roles);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Authentication required.";
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: msg === "jwt expired" ? "Sesión expirada. Inicie sesión de nuevo." : "Authentication required."
    });
  }
};
