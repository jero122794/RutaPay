// backend/src/middleware/ownership.middleware.ts
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertLoanAccessForActor } from "../shared/loan-ownership.js";

const paymentBodyLoanIdSchema = z.object({
  loanId: z.string().cuid()
});

const sendError = (reply: FastifyReply, err: FastifyError): void => {
  reply.code(err.statusCode ?? 500).send({
    statusCode: err.statusCode ?? 500,
    error: err.name,
    message: err.message
  });
};

/**
 * Verifies the authenticated user may access the loan referenced by :id or :loanId (IDOR).
 * Must run after authGuard (and typically roleGuard).
 */
export const verifyLoanOwnershipParam =
  (param: "id" | "loanId") =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = request.authUser;
    if (!auth) {
      reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required."
      });
      return;
    }

    const raw = request.params as Record<string, unknown>;
    const loanId = raw[param];
    if (typeof loanId !== "string" || !loanId) {
      reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid loan identifier."
      });
      return;
    }

    try {
      await assertLoanAccessForActor(loanId, auth.id, auth.roles, auth.businessId ?? null);
    } catch (error) {
      const err = error as FastifyError;
      if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
        sendError(reply, err);
        return;
      }
      throw error;
    }
  };

/**
 * Verifies access to loanId in JSON body for POST /payments.
 * If body shape is invalid, skips (controller Zod will return 400).
 */
export const verifyLoanOwnershipFromPaymentBody = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const auth = request.authUser;
  if (!auth) {
    reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
    return;
  }

  const parsed = paymentBodyLoanIdSchema.safeParse(request.body);
  if (!parsed.success) {
    return;
  }

  try {
    await assertLoanAccessForActor(parsed.data.loanId, auth.id, auth.roles, auth.businessId ?? null);
  } catch (error) {
    const err = error as FastifyError;
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      sendError(reply, err);
      return;
    }
    throw error;
  }
};
