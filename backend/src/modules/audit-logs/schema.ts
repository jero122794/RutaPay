// backend/src/modules/audit-logs/schema.ts
import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.schema.js";

export const listAuditLogsQuerySchema = paginationQuerySchema;

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

