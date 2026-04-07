// backend/src/modules/audit-logs/service.ts
import type { PaginationQuery } from "../../shared/pagination.schema.js";
import { prismaPaginationBounds } from "../../shared/pagination.schema.js";
import { prisma } from "../../shared/prisma.js";

export interface AuditLogRow {
  id: string;
  createdAt: Date;
  userId: string | null;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
}

export const listAuditLogs = async (
  pagination: PaginationQuery
): Promise<{ data: AuditLogRow[]; total: number; page: number; limit: number }> => {
  const total = await prisma.auditLog.count();
  const { skip, take, page } = prismaPaginationBounds(total, pagination.page, pagination.limit);

  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip,
    take,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          documentId: true
        }
      }
    }
  });

  const data: AuditLogRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    userId: r.userId ?? null,
    actorName: r.user?.name ?? r.user?.email ?? r.user?.documentId ?? "Sistema",
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId ?? null
  }));

  return { data, total, page, limit: pagination.limit };
};

