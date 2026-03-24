// backend/src/modules/users/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
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
  app.get("/", { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"])] }, listUsersController);
  app.post("/", { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"])] }, createUserController);
  app.get("/:id", { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"])] }, getUserByIdController);
  app.patch("/:id", { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"])] }, updateUserController);
  app.delete("/:id", { preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"])] }, deleteUserController);
  app.post(
    "/:id/roles",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"])] },
    assignRolesController
  );
};
