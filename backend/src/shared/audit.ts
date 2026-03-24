// backend/src/shared/audit.ts
import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export interface AuditParams {
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip: string;
  userAgent: string;
}

export const writeAuditLog = async (params: AuditParams): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? undefined,
        oldValue: params.oldValue === undefined ? undefined : (params.oldValue as object),
        newValue: params.newValue === undefined ? undefined : (params.newValue as object),
        ip: params.ip,
        userAgent: params.userAgent
      }
    });
  } catch (err) {
    // Never break primary flow if audit insert fails
    console.error("audit_log_write_failed", err);
  }
};

export const clientIp = (request: FastifyRequest): string => {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? request.ip;
  }
  return request.ip ?? "unknown";
};

export const userAgentHeader = (request: FastifyRequest): string => {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua : "";
};

/** Avoid storing full national ID in audit trails (habeas data). */
export const maskIdentifierTail = (identifier: string): string => {
  const t = identifier.trim();
  if (t.length <= 4) {
    return "****";
  }
  return `****${t.slice(-4)}`;
};
