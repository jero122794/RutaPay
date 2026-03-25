// backend/src/modules/clients/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { ensureActor } from "../../shared/request-actor.js";
import { clientIdParamsSchema, createClientSchema, updateClientSchema } from "./schema.js";
import * as clientService from "./service.js";

export const listClientsController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await clientService.listClients(actor.id, actor.roles, actor.businessId, pagination);
  reply.send(body);
};

export const createClientController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const input = createClientSchema.parse(request.body);
  const client = await clientService.createClient(input, actor.id, actor.roles, actor.businessId);
  reply.code(201).send({
    data: client,
    message: "Client created successfully."
  });
};

export const getClientByIdController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = clientIdParamsSchema.parse(request.params);
  const client = await clientService.getClientById(id, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: client
  });
};

export const updateClientController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = clientIdParamsSchema.parse(request.params);
  const input = updateClientSchema.parse(request.body);
  const client = await clientService.updateClient(id, input, actor.id, actor.roles, actor.businessId);
  reply.send({
    data: client,
    message: "Client updated successfully."
  });
};
