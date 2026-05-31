// backend/src/modules/clients/controller.ts
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { ensureActor } from "../../shared/request-actor.js";
import {
  clientIdParamsSchema,
  createClientSchema,
  transferFormatQuerySchema,
  updateClientSchema
} from "./schema.js";
import * as clientService from "./service.js";
import {
  buildClientsExport,
  buildImportTemplate,
  importClientsFromFile
} from "./transfer.service.js";

const badRequest = (message: string): FastifyError => {
  const err = new Error(message) as FastifyError;
  err.statusCode = 400;
  err.name = "Bad Request";
  return err;
};

export const listClientsController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const pagination = parseOptionalPaginationQuery(request.query);
  const qRaw = (request.query as Record<string, unknown> | undefined)?.q;
  const q = typeof qRaw === "string" ? qRaw.trim() : "";
  const body = await clientService.listClients(actor.id, actor.roles, actor.businessId, pagination, q);
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

export const exportClientsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { format } = transferFormatQuerySchema.parse(request.query);
  const file = await buildClientsExport(actor, format);
  reply
    .header("Content-Type", file.contentType)
    .header("Content-Disposition", `attachment; filename="${file.filename}"`)
    .send(file.buffer);
};

export const importTemplateController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { format } = transferFormatQuerySchema.parse(request.query);
  const file = await buildImportTemplate(actor, format);
  reply
    .header("Content-Type", file.contentType)
    .header("Content-Disposition", `attachment; filename="${file.filename}"`)
    .send(file.buffer);
};

export const importClientsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const upload = await request.file();
  if (!upload) {
    throw badRequest("No se recibió ningún archivo.");
  }

  const filename = upload.filename.toLowerCase();
  if (!filename.endsWith(".csv") && !filename.endsWith(".xlsx")) {
    throw badRequest("Formato no soportado. Sube un archivo .xlsx o .csv.");
  }

  const buffer = await upload.toBuffer();
  const result = await importClientsFromFile(actor, buffer, upload.filename);
  reply.send({
    data: result,
    message: `Importación finalizada: ${result.created} creados, ${result.failed} con error.`
  });
};
