// backend/src/modules/audit-logs/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { listAuditLogsQuerySchema } from "./schema.js";
import * as auditLogsService from "./service.js";

export const listAuditLogsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const query = listAuditLogsQuerySchema.parse(request.query);
  const body = await auditLogsService.listAuditLogs(query);
  reply.send(body);
};

