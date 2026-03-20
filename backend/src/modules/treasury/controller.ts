// backend/src/modules/treasury/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { creditRouteSchema, managerIdParamsSchema, routeIdParamsSchema } from "./schema.js";
import * as treasuryService from "./service.js";

const ensureActor = (request: FastifyRequest): { id: string; roles: string[] } => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }
  return { id: actor.id, roles: actor.roles };
};

export const getRouteBalanceController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { routeId } = routeIdParamsSchema.parse(request.params);
  const result = await treasuryService.getRouteBalance(routeId, actor.id, actor.roles);
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
  const result = await treasuryService.creditRouteBalance(input, actor.id);
  reply.send({
    data: result,
    message: "Route credited successfully."
  });
};

export const getLiquidationController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = managerIdParamsSchema.parse(request.params);
  const result = await treasuryService.getManagerLiquidation(id);
  reply.send({
    data: result
  });
};
