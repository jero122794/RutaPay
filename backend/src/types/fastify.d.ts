// backend/src/types/fastify.d.ts
import "@fastify/jwt";
import "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      roles: string[];
    };
    user: {
      sub: string;
      email: string;
      roles: string[];
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      email: string;
      roles: string[];
    };
  }
}
