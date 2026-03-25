// backend/src/modules/role-modules/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import { getRoleModulesController, putRoleModulesController } from "./controller.js";

export const roleModulesRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("ROLE_MODULES")] },
    getRoleModulesController
  );
  app.put(
    "/",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("ROLE_MODULES")] },
    putRoleModulesController
  );
};
