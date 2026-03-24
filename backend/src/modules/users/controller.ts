// backend/src/modules/users/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp, userAgentHeader, writeAuditLog } from "../../shared/audit.js";
import { parseOptionalPaginationQuery } from "../../shared/pagination.schema.js";
import { assignRolesSchema, createUserSchema, updateUserSchema, userIdParamsSchema } from "./schema.js";
import * as userService from "./service.js";

const ensureActor = (request: FastifyRequest): { id: string; roles: string[] } => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }

  return { id: actor.id, roles: actor.roles };
};

export const listUsersController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const pagination = parseOptionalPaginationQuery(request.query);
  const body = await userService.listUsers(pagination);
  reply.send(body);
};

export const createUserController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = ensureActor(request);
  const input = createUserSchema.parse(request.body);
  const user = await userService.createUser(input);
  await writeAuditLog({
    userId: actor.id,
    action: "USER_CREATE",
    resourceType: "user",
    resourceId: user.id,
    newValue: { email: user.email, roles: user.roles },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.code(201).send({
    data: user,
    message: "User created successfully."
  });
};

export const getUserByIdController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = userIdParamsSchema.parse(request.params);
  const user = await userService.getUserById(id);
  reply.send({
    data: user
  });
};

export const updateUserController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = userIdParamsSchema.parse(request.params);
  const input = updateUserSchema.parse(request.body);

  const before = await userService.getUserById(id);
  const user = await userService.updateUser(id, input, actor.roles);
  await writeAuditLog({
    userId: actor.id,
    action: "USER_UPDATE",
    resourceType: "user",
    resourceId: id,
    oldValue: { name: before.name, phone: before.phone, isActive: before.isActive },
    newValue: { name: user.name, phone: user.phone, isActive: user.isActive },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: user,
    message: "User updated successfully."
  });
};

export const deleteUserController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = userIdParamsSchema.parse(request.params);
  await userService.deleteUser(id, actor.id, actor.roles);
  await writeAuditLog({
    userId: actor.id,
    action: "USER_DELETE",
    resourceType: "user",
    resourceId: id,
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: true,
    message: "User deleted successfully."
  });
};

export const assignRolesController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actor = ensureActor(request);
  const { id } = userIdParamsSchema.parse(request.params);
  const input = assignRolesSchema.parse(request.body);

  const before = await userService.getUserById(id);
  const user = await userService.assignRoles(id, input, actor.roles);
  await writeAuditLog({
    userId: actor.id,
    action: "USER_ROLES_ASSIGN",
    resourceType: "user",
    resourceId: id,
    oldValue: { roles: before.roles },
    newValue: { roles: user.roles },
    ip: clientIp(request),
    userAgent: userAgentHeader(request)
  });
  reply.send({
    data: user,
    message: "Roles updated successfully."
  });
};
