// backend/src/modules/routes/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { ensureActor } from "../../shared/request-actor.js";
import { addBalanceSchema, createRouteSchema, routeIdParamsSchema, updateRouteSchema } from "./schema.js";
import * as routeService from "./service.js";

export const listRoutesController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await routeService.listRoutes(actor.roles, actor.businessId, pagination);
  reply.send(body);
};

export const listMyRoutesController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await routeService.listRoutesByManagerId(actor.id, pagination);
  reply.send(body);
};

export const createRouteController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const input = createRouteSchema.parse(request.body);
  const route = await routeService.createRoute(input, actor.roles, actor.businessId);
  reply.code(201).send({
    data: route,
    message: "Route created successfully."
  });
};

export const getRouteByIdController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = routeIdParamsSchema.parse(request.params);
  const route = await routeService.getRouteById(id, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: route
  });
};

export const updateRouteController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = routeIdParamsSchema.parse(request.params);
  const input = updateRouteSchema.parse(request.body);

  const previous = await routeService.getRouteById(id, actor.id, actor.roles, actor.businessId);
  const route = await routeService.updateRoute(id, input, actor.id, actor.roles, actor.businessId);

  await writeAuditLog({
    userId: actor.id,
    action: "ROUTE_UPDATED",
    resourceType: "route",
    resourceId: id,
    oldValue: { name: previous.name, managerId: previous.managerId },
    newValue: { name: route.name, managerId: route.managerId },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.send({
    data: route,
    message: "Route updated successfully."
  });
};

export const addBalanceController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = routeIdParamsSchema.parse(request.params);
  const input = addBalanceSchema.parse(request.body);
  const route = await routeService.addBalanceToRoute(id, input, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: route,
    message: "Balance added successfully."
  });
};

export const getRouteSummaryController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = routeIdParamsSchema.parse(request.params);
  const summary = await routeService.getRouteSummary(id, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: summary
  });
};
