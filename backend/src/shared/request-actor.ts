// backend/src/shared/request-actor.ts
import type { AppModule } from "@prisma/client";
import type { FastifyRequest } from "fastify";

export interface RequestActor {
  id: string;
  roles: string[];
  businessId: string | null;
  modules: AppModule[];
}

export const ensureActor = (request: FastifyRequest): RequestActor => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }

  return {
    id: actor.id,
    roles: actor.roles,
    businessId: actor.businessId ?? null,
    modules: actor.modules ?? []
  };
};
