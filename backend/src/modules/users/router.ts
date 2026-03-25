// backend/src/modules/users/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  assignRolesController,
  createUserController,
  deleteUserController,
  getUserByIdController,
  listUsersController,
  updateUserController
} from "./controller.js";

export const usersRouter = async (app: FastifyInstance): Promise<void> => {
  app.get("/", { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("USERS")] }, listUsersController);
  app.post(
    "/",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("USERS")] },
    createUserController
  );
  app.get(
    "/:id",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("USERS")] },
    getUserByIdController
  );
  app.patch(
    "/:id",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("USERS")] },
    updateUserController
  );
  app.delete(
    "/:id",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("USERS")] },
    deleteUserController
  );
  app.post(
    "/:id/roles",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("USERS")] },
    assignRolesController
  );
};
