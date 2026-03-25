// backend/src/modules/role-modules/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { putRoleModulesSchema } from "./schema.js";
import * as roleModulesService from "./service.js";

export const getRoleModulesController = async (
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const data = await roleModulesService.getRoleModuleGrants();
  reply.send({ data });
};

export const putRoleModulesController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const input = putRoleModulesSchema.parse(request.body);
  await roleModulesService.replaceRoleModuleGrants(input);
  const data = await roleModulesService.getRoleModuleGrants();
  reply.send({ data, message: "Role module grants updated." });
};
