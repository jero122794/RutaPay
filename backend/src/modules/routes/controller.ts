// backend/src/modules/routes/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { addBalanceSchema, createRouteSchema, routeIdParamsSchema, updateRouteSchema } from "./schema.js";
import * as routeService from "./service.js";

const ensureActor = (request: FastifyRequest): { id: string; roles: string[] } => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }

  return {
    id: actor.id,
    roles: actor.roles
  };
};

export const listRoutesController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await routeService.listRoutes(pagination);
  reply.send(body);
};

export const listMyRoutesController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await routeService.listRoutesByManagerId(actor.id, pagination);
  reply.send(body);
};

export const createRouteController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const input = createRouteSchema.parse(request.body);
  const route = await routeService.createRoute(input);
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
  const route = await routeService.getRouteById(id, actor.id, actor.roles);
  reply.send({
    data: route
  });
};

export const updateRouteController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = routeIdParamsSchema.parse(request.params);
  const input = updateRouteSchema.parse(request.body);
  const route = await routeService.updateRoute(id, input);
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
  const route = await routeService.addBalanceToRoute(id, input, actor.id);
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
  const summary = await routeService.getRouteSummary(id, actor.id, actor.roles);
  reply.send({
    data: summary
  });
};
