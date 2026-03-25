// backend/src/modules/clients/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  createClientController,
  getClientByIdController,
  listClientsController,
  updateClientController
} from "./controller.js";

export const clientsRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"]),
        moduleGuard("CLIENTS")
      ]
    },
    listClientsController
  );
  app.post(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"]),
        moduleGuard("CLIENTS")
      ]
    },
    createClientController
  );
  app.get(
    "/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"]),
        moduleGuard("CLIENTS")
      ]
    },
    getClientByIdController
  );
  app.patch(
    "/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"]),
        moduleGuard("CLIENTS")
      ]
    },
    updateClientController
  );
};
