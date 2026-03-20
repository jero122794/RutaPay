// backend/src/middleware/error.middleware.ts
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export const errorHandler = (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): void => {
  if (error instanceof ZodError) {
    reply.code(400).send({
      statusCode: 400,
      error: "Bad Request",
      message: "Validation error.",
      details: error.flatten()
    });
    return;
  }

  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  reply.code(statusCode).send({
    statusCode,
    error: statusCode >= 500 ? "Internal Server Error" : error.name,
    message: error.message || "Unexpected error."
  });
};
