// backend/src/middleware/idempotency.middleware.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { redis } from "../shared/redis.js";

const idempotencyKeySchema = z.string().uuid();

/**
 * Payment idempotency (A04): same X-Idempotency-Key replays cached 2xx body for 24h.
 * Uses request.idempotencyRedisKey + global hooks in app.ts to persist the response.
 */
export const paymentIdempotencyPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const raw = request.headers["x-idempotency-key"];
    if (typeof raw !== "string" || !idempotencyKeySchema.safeParse(raw).success) {
      reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Encabezado X-Idempotency-Key inválido o ausente (debe ser un UUID)."
      });
      return;
    }

    const redisKey = `idempotency:payment:${raw}`;

    const existing = await redis.get(redisKey);
    if (existing === "__pending__") {
      reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "La solicitud de pago ya se está procesando."
      });
      return;
    }
    if (existing !== null && existing !== undefined) {
      try {
        const parsed = JSON.parse(existing) as { statusCode: number; body: string };
        if (typeof parsed.statusCode === "number" && typeof parsed.body === "string") {
          reply.header("X-Idempotency-Replayed", "true");
          reply.code(parsed.statusCode).type("application/json").send(JSON.parse(parsed.body) as object);
          return;
        }
      } catch {
        // legacy cache shape
      }
      reply.header("X-Idempotency-Replayed", "true");
      reply.type("application/json").send(JSON.parse(existing) as object);
      return;
    }

    const locked = await redis.set(redisKey, "__pending__", "EX", 86400, "NX");
    if (locked !== "OK") {
      reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "La solicitud de pago ya se está procesando."
      });
      return;
    }

    request.idempotencyRedisKey = redisKey;
  } catch {
    // Redis unavailable: skip idempotency (fail open).
  }
};
