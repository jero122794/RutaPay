// backend/src/modules/loans/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { ensureActor } from "../../shared/request-actor.js";
import {
  calculateLoanSchema,
  createLoanSchema,
  loanIdParamsSchema,
  updateLoanStatusSchema,
  updateLoanTermsSchema
} from "./schema.js";
import * as loanService from "./service.js";

export const listLoansController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const qRaw = (request.query as Record<string, unknown> | undefined)?.q;
  const q = typeof qRaw === "string" ? qRaw.trim() : "";
  const body = await loanService.listLoans(actor.id, actor.roles, actor.businessId, pagination, q);
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
  const loan = await loanService.createLoan(input, actor.id, actor.roles, actor.businessId);
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
  const loan = await loanService.getLoanById(id, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: loan
  });
};

export const updateLoanStatusController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = loanIdParamsSchema.parse(request.params);
  const input = updateLoanStatusSchema.parse(request.body);
  const loan = await loanService.updateLoanStatus(
    id,
    input,
    actor.id,
    actor.roles,
    actor.businessId
  );
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
  const schedule = await loanService.getLoanSchedule(id, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: schedule
  });
};

export const updateLoanTermsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = loanIdParamsSchema.parse(request.params);
  const input = updateLoanTermsSchema.parse(request.body);
  const loan = await loanService.updateLoanTerms(
    id,
    input,
    actor.id,
    actor.roles,
    actor.businessId
  );
  await writeAuditLog({
    userId: actor.id,
    action: "LOAN_TERMS_UPDATE",
    resourceType: "loan",
    resourceId: loan.id,
    newValue: {
      interestRatePercent: input.interestRate,
      frequency: input.frequency,
      installmentCount: input.installmentCount
    },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: loan,
    message: "Loan terms updated."
  });
};

export const deleteLoanController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = loanIdParamsSchema.parse(request.params);
  await loanService.deleteLoan(id, actor.id, actor.roles, actor.businessId);
  await writeAuditLog({
    userId: actor.id,
    action: "LOAN_DELETE",
    resourceType: "loan",
    resourceId: id,
    newValue: {},
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.code(204).send();
};
