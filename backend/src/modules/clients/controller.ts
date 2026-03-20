// backend/src/modules/clients/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIdParamsSchema, createClientSchema, updateClientSchema } from "./schema.js";
import * as clientService from "./service.js";

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

export const listClientsController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const clients = await clientService.listClients(actor.id, actor.roles);
  reply.send({
    data: clients,
    total: clients.length,
    page: 1,
    limit: clients.length
  });
};

export const createClientController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const input = createClientSchema.parse(request.body);
  const client = await clientService.createClient(input, actor.id, actor.roles);
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
  const client = await clientService.getClientById(id, actor.id, actor.roles);
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
  const client = await clientService.updateClient(id, input, actor.id, actor.roles);
  reply.send({
    data: client,
    message: "Client updated successfully."
  });
};
