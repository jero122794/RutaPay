// backend/src/modules/payments/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { redis } from "../../shared/redis.js";
import { createPaymentSchema, loanIdParamsSchema, paymentIdParamsSchema, reversePaymentSchema } from "./schema.js";
import * as paymentService from "./service.js";

const ensureActor = (request: FastifyRequest): { id: string; roles: string[] } => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }
  return { id: actor.id, roles: actor.roles };
};

export const listPaymentsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await paymentService.listPayments(actor.id, actor.roles, pagination);
  reply.send(body);
};

export const createPaymentController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const input = createPaymentSchema.parse(request.body);
  const payment = await paymentService.createPayment(input, actor.id, actor.roles);
  await writeAuditLog({
    userId: actor.id,
    action: "PAYMENT_CREATE",
    resourceType: "payment",
    resourceId: payment.id,
    newValue: { loanId: payment.loanId, amount: payment.amount, scheduleId: payment.scheduleId },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  const responseBody = {
    data: payment,
    message: "Payment registered successfully."
  };

  const idemKey = request.idempotencyRedisKey;
  if (idemKey) {
    try {
      await redis.set(
        idemKey,
        JSON.stringify({ statusCode: 201, body: JSON.stringify(responseBody) }),
        "EX",
        86400
      );
    } catch {
      // Do not fail payment if cache write fails
    }
  }

  reply.code(201).send(responseBody);
};

export const listPaymentsByLoanController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { loanId } = loanIdParamsSchema.parse(request.params);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await paymentService.listPaymentsByLoan(loanId, actor.id, actor.roles, pagination);
  reply.send(body);
};

export const reversePaymentController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = paymentIdParamsSchema.parse(request.params);
  const input = reversePaymentSchema.parse(request.body);
  const payment = await paymentService.reversePayment(id, input, actor.id, actor.roles);
  await writeAuditLog({
    userId: actor.id,
    action: "PAYMENT_REVERSE",
    resourceType: "payment",
    resourceId: payment.id,
    newValue: { loanId: payment.loanId, amount: payment.amount, scheduleId: payment.scheduleId },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: payment,
    message: "Payment reversed successfully."
  });
};
