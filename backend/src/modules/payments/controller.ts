// backend/src/modules/payments/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { createPaymentSchema, loanIdParamsSchema } from "./schema.js";
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
  const payments = await paymentService.listPayments(actor.id, actor.roles);
  reply.send({
    data: payments,
    total: payments.length,
    page: 1,
    limit: payments.length
  });
};

export const createPaymentController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const input = createPaymentSchema.parse(request.body);
  const payment = await paymentService.createPayment(input, actor.id, actor.roles);
  reply.code(201).send({
    data: payment,
    message: "Payment registered successfully."
  });
};

export const listPaymentsByLoanController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { loanId } = loanIdParamsSchema.parse(request.params);
  const payments = await paymentService.listPaymentsByLoan(loanId, actor.id, actor.roles);
  reply.send({
    data: payments,
    total: payments.length,
    page: 1,
    limit: payments.length
  });
};
