// backend/src/modules/users/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { assignRolesSchema, createUserSchema, updateUserSchema, userIdParamsSchema } from "./schema.js";
import * as userService from "./service.js";

const ensureActor = (request: FastifyRequest): { id: string; roles: string[] } => {
  const actor = request.authUser;
  if (!actor) {
    throw new Error("Authentication required.");
  }

  return { id: actor.id, roles: actor.roles };
};

export const listUsersController = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const users = await userService.listUsers();
  reply.send({
    data: users,
    total: users.length,
    page: 1,
    limit: users.length
  });
};

export const createUserController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const input = createUserSchema.parse(request.body);
  const user = await userService.createUser(input);
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

  const user = await userService.updateUser(id, input, actor.roles);
  reply.send({
    data: user,
    message: "User updated successfully."
  });
};

export const deleteUserController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { id } = userIdParamsSchema.parse(request.params);
  await userService.deleteUser(id);
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

  const user = await userService.assignRoles(id, input, actor.roles);
  reply.send({
    data: user,
    message: "Roles updated successfully."
  });
};
