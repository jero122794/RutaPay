// backend/src/modules/loans/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import {
  calculateLoanSchema,
  createLoanSchema,
  loanIdParamsSchema,
  updateLoanStatusSchema
} from "./schema.js";
import * as loanService from "./service.js";

const ensureActor = (request: FastifyRequest): { id: string; roles: string[] } => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }
  return { id: actor.id, roles: actor.roles };
};

export const listLoansController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await loanService.listLoans(actor.id, actor.roles, pagination);
  reply.send(body);
};

export const calculateLoanController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const input = calculateLoanSchema.parse(request.body);
  const result = loanService.calculateLoanPreview(input);
  reply.send({
    data: result,
    message: "Loan preview calculated."
  });
};

export const createLoanController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const input = createLoanSchema.parse(request.body);
  const loan = await loanService.createLoan(input, actor.id, actor.roles);
  await writeAuditLog({
    userId: actor.id,
    action: "LOAN_CREATE",
    resourceType: "loan",
    resourceId: loan.id,
    newValue: {
      routeId: loan.routeId,
      clientId: loan.clientId,
      principal: loan.principal,
      installmentCount: loan.installmentCount
    },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.code(201).send({
    data: loan,
    message: "Loan created successfully."
  });
};

export const getLoanByIdController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = loanIdParamsSchema.parse(request.params);
  const loan = await loanService.getLoanById(id, actor.id, actor.roles);
  reply.send({
    data: loan
  });
};

export const updateLoanStatusController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = loanIdParamsSchema.parse(request.params);
  const input = updateLoanStatusSchema.parse(request.body);
  const loan = await loanService.updateLoanStatus(id, input);
  reply.send({
    data: loan,
    message: "Loan status updated."
  });
};

export const getLoanScheduleController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = loanIdParamsSchema.parse(request.params);
  const schedule = await loanService.getLoanSchedule(id, actor.id, actor.roles);
  reply.send({
    data: schedule
  });
};
