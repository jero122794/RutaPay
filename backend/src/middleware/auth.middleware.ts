// backend/src/middleware/auth.middleware.ts
import type { AppModule, RoleName } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { assertBusinessLicenseActiveForOperationalRoles } from "../shared/business-license.js";
import { loadRolesByUserId } from "../shared/load-user-roles.js";
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

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      throw new Error("Invalid token.");
    }

    const rolesFromToken = Array.isArray(payload.roles) ? (payload.roles as RoleName[]) : [];
    const rolesFromDb = await loadRolesByUserId(sub);
    // Prefer DB roles so roleGuard/moduleGuard match current assignments (JWT may be stale until refresh).
    const roles: RoleName[] = rolesFromDb.length > 0 ? rolesFromDb : rolesFromToken;

    let modules: AppModule[] = [];
    if (roles.length > 0) {
      modules = await loadModulesForRoles(roles);
    } else if (Array.isArray(payload.modules)) {
      modules = payload.modules as AppModule[];
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
