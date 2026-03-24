// backend/src/middleware/error.middleware.ts
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export const errorHandler = (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): void => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message:
          "La base de datos no tiene el esquema actualizado. En la carpeta backend ejecuta `npx prisma db push` (o `prisma migrate deploy`) y reinicia el servidor."
      });
      return;
    }
  }

  if (error instanceof ZodError) {
    reply.code(400).send({
      statusCode: 400,
      error: "Bad Request",
      message: "Validation error.",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof TypeError && String(error.message).includes("findUnique")) {
    reply.code(503).send({
      statusCode: 503,
      error: "Service Unavailable",
      message:
        "Cliente Prisma desactualizado o servidor sin reiniciar. En backend: `npx prisma generate`, luego reinicia el API."
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
