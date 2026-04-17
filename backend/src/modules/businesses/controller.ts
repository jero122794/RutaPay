// backend/src/modules/businesses/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import {
  assignBusinessMemberSchema,
  businessIdParamsSchema,
  businessMemberUserParamsSchema,
  createBusinessSchema,
  createFirstBusinessAdminSchema,
  setBusinessLicenseSchema,
  updateBusinessSchema
} from "./schema.js";
import * as businessService from "./service.js";

export const listBusinessesController = async (
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const data = await businessService.listBusinesses();
  reply.send({ data });
};

export const listAssignableUsersController = async (
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const data = await businessService.listAssignableUsers();
  reply.send({ data });
};

export const getBusinessByIdController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = businessIdParamsSchema.parse(request.params);
  const data = await businessService.getBusinessById(id);
  reply.send({ data });
};

export const createBusinessController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const input = createBusinessSchema.parse(request.body);
  const row = await businessService.createBusiness(input);
  reply.code(201).send({ data: row, message: "Business created." });
};

export const updateBusinessController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = businessIdParamsSchema.parse(request.params);
  const input = updateBusinessSchema.parse(request.body);
  const row = await businessService.updateBusiness(id, input);
  reply.send({ data: row, message: "Business updated." });
};

export const setBusinessLicenseController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = request.authUser;
  if (!actor) {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication required." });
    return;
  }

  const { id } = businessIdParamsSchema.parse(request.params);
  const input = setBusinessLicenseSchema.parse(request.body);
  const row = await businessService.setBusinessLicense(id, input);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_LICENSE_SET",
    resourceType: "business",
    resourceId: id,
    newValue: { licenseStartsAt: row.licenseStartsAt, licenseEndsAt: row.licenseEndsAt },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.send({ data: row, message: "Business license updated." });
};

export const createFirstBusinessAdminController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = request.authUser;
  if (!actor) {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication required." });
    return;
  }

  const { id } = businessIdParamsSchema.parse(request.params);
  const input = createFirstBusinessAdminSchema.parse(request.body);
  const member = await businessService.createFirstBusinessAdmin(id, input);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_FIRST_ADMIN_CREATE",
    resourceType: "business",
    resourceId: id,
    newValue: { createdUserId: member.userId, email: member.email },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.code(201).send({ data: member, message: "Administrator user created for this business." });
};

export const assignBusinessMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = request.authUser;
  if (!actor) {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication required." });
    return;
  }

  const { id } = businessIdParamsSchema.parse(request.params);
  const input = assignBusinessMemberSchema.parse(request.body);
  const member = await businessService.assignBusinessMember(id, input);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_MEMBER_ASSIGN",
    resourceType: "business",
    resourceId: id,
    newValue: { userId: input.userId, role: input.role },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.code(201).send({ data: member, message: "Member assigned to business." });
};

export const removeBusinessMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = request.authUser;
  if (!actor) {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication required." });
    return;
  }

  const { id, userId } = businessMemberUserParamsSchema.parse(request.params);
  await businessService.removeBusinessMember(id, userId);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_MEMBER_REMOVE",
    resourceType: "business",
    resourceId: id,
    newValue: { userId },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.send({ data: true, message: "Member removed from business." });
};

export const deleteBusinessController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = request.authUser;
  if (!actor) {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication required." });
    return;
  }

  const { id } = businessIdParamsSchema.parse(request.params);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_DELETE_ATTEMPT",
    resourceType: "business",
    resourceId: id,
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  await businessService.deleteBusiness(id);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_DELETED",
    resourceType: "business",
    resourceId: id,
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.send({ data: true, message: "Business deleted successfully." });
};

export const reconcileBusinessScopeController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = request.authUser;
  if (!actor) {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Authentication required." });
    return;
  }

  const { id } = businessIdParamsSchema.parse(request.params);
  const result = await businessService.reconcileBusinessScope(id);

  await writeAuditLog({
    userId: actor.id,
    action: "BUSINESS_SCOPE_RECONCILE",
    resourceType: "business",
    resourceId: id,
    newValue: result,
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });

  reply.send({
    data: result,
    message: "Rutas y clientes alineados con el negocio."
  });
};
