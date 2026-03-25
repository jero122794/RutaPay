// backend/src/types/fastify.d.ts
import type { AppModule } from "@prisma/client";
import "@fastify/jwt";
import "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      roles: string[];
      businessId: string | null;
      modules: AppModule[];
    };
    user: {
      sub: string;
      email: string;
      roles: string[];
      businessId: string | null;
      modules: AppModule[];
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      email: string;
      roles: string[];
      businessId: string | null;
      modules: AppModule[];
    };
    /** Set by payment idempotency preHandler; consumed by global onSend/onResponse hooks. */
    idempotencyRedisKey?: string;
  }
}
