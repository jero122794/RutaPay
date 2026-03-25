// backend/src/modules/treasury/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import { ensureActor } from "../../shared/request-actor.js";
import {
  creditRouteSchema,
  liquidationQuerySchema,
  liquidationReviewApproveBodySchema,
  liquidationReviewDateBodySchema,
  liquidationReviewRejectBodySchema,
  liquidationReviewsListQuerySchema,
  managerIdParamsSchema,
  reviewManagerParamsSchema,
  routeIdParamsSchema
} from "./schema.js";
import * as treasuryService from "./service.js";

export const getRouteBalanceController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { routeId } = routeIdParamsSchema.parse(request.params);
  const result = await treasuryService.getRouteBalance(
    routeId,
    actor.id,
    actor.roles,
    actor.businessId
  );
  reply.send({
    data: result
  });
};

export const creditRouteController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const input = creditRouteSchema.parse(request.body);
  const result = await treasuryService.creditRouteBalance(
    input,
    actor.id,
    actor.roles,
    actor.businessId
  );
  await writeAuditLog({
    userId: actor.id,
    action: "TREASURY_ROUTE_CREDIT",
    resourceType: "route",
    resourceId: input.routeId,
    newValue: { amount: input.amount, reference: input.reference ?? null },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: result,
    message: "Route credited successfully."
  });
};

export const getLiquidationController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = managerIdParamsSchema.parse(request.params);
  const query = liquidationQuerySchema.parse(request.query);

  const isSuper = actor.roles.includes("SUPER_ADMIN");
  const isAdmin = actor.roles.includes("ADMIN");
  const isSelfManager = actor.roles.includes("ROUTE_MANAGER") && id === actor.id;
  if (!isSuper && !isAdmin && !isSelfManager) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "You can only view your own liquidation."
    });
    return;
  }

  if (isAdmin && !isSuper) {
    try {
      await treasuryService.assertManagerInBusinessScope(id, actor.roles, actor.businessId);
    } catch {
      reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "You do not have access to this liquidation."
      });
      return;
    }
  }

  const dateYmd = treasuryService.resolveLiquidationDate(query.date);
  const result = await treasuryService.getManagerLiquidationDetail(id, dateYmd);
  reply.send({
    data: result
  });
};

export const listLiquidationReviewsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const isAdmin = actor.roles.includes("ADMIN") || actor.roles.includes("SUPER_ADMIN");
  if (!isAdmin) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Only administrators can list liquidation reviews."
    });
    return;
  }

  const query = liquidationReviewsListQuerySchema.parse(request.query);
  const dateYmd = treasuryService.resolveLiquidationDate(query.date);
  const isSuper = actor.roles.includes("SUPER_ADMIN");
  const result = await treasuryService.listLiquidationReviewsForAdmin(
    dateYmd,
    query.page,
    query.limit,
    actor.businessId,
    isSuper
  );
  reply.send({
    data: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit
  });
};

export const getMyLiquidationReviewController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  if (!actor.roles.includes("ROUTE_MANAGER")) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Only route managers can access this resource."
    });
    return;
  }

  const query = liquidationQuerySchema.parse(request.query);
  const dateYmd = treasuryService.resolveLiquidationDate(query.date);
  const result = await treasuryService.getLiquidationReviewForManagerSelf(actor.id, dateYmd);
  reply.send({ data: result });
};

export const submitLiquidationReviewController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  if (!actor.roles.includes("ROUTE_MANAGER")) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Only route managers can submit liquidation reviews."
    });
    return;
  }

  const body = liquidationReviewDateBodySchema.parse(request.body);
  const dateYmd = treasuryService.resolveLiquidationDate(body.date);
  const result = await treasuryService.submitLiquidationReview(actor.id, dateYmd, body.managerNote);
  await writeAuditLog({
    userId: actor.id,
    action: "LIQUIDATION_SUBMIT",
    resourceType: "liquidation_review",
    resourceId: `${actor.id}:${dateYmd}`,
    newValue: { businessDate: dateYmd },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: result,
    message: "Liquidation submitted for review."
  });
};

export const approveLiquidationReviewController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const isAdmin = actor.roles.includes("ADMIN") || actor.roles.includes("SUPER_ADMIN");
  if (!isAdmin) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Only administrators can approve liquidation reviews."
    });
    return;
  }

  const { managerId } = reviewManagerParamsSchema.parse(request.params);
  const body = liquidationReviewApproveBodySchema.parse(request.body);
  const dateYmd = treasuryService.resolveLiquidationDate(body.date);
  const result = await treasuryService.approveLiquidationReview(
    actor.id,
    managerId,
    dateYmd,
    body.reviewNote,
    actor.roles,
    actor.businessId
  );
  await writeAuditLog({
    userId: actor.id,
    action: "LIQUIDATION_APPROVE",
    resourceType: "liquidation_review",
    resourceId: `${managerId}:${dateYmd}`,
    newValue: { businessDate: dateYmd },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: result,
    message: "Liquidation approved."
  });
};

export const rejectLiquidationReviewController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const isAdmin = actor.roles.includes("ADMIN") || actor.roles.includes("SUPER_ADMIN");
  if (!isAdmin) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Only administrators can reject liquidation reviews."
    });
    return;
  }

  const { managerId } = reviewManagerParamsSchema.parse(request.params);
  const body = liquidationReviewRejectBodySchema.parse(request.body);
  const dateYmd = treasuryService.resolveLiquidationDate(body.date);
  const result = await treasuryService.rejectLiquidationReview(
    actor.id,
    managerId,
    dateYmd,
    body.reason,
    actor.roles,
    actor.businessId
  );
  await writeAuditLog({
    userId: actor.id,
    action: "LIQUIDATION_REJECT",
    resourceType: "liquidation_review",
    resourceId: `${managerId}:${dateYmd}`,
    newValue: { businessDate: dateYmd },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: result,
    message: "Liquidation rejected."
  });
};
