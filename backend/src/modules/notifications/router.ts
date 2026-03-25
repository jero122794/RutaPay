// backend/src/modules/notifications/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  listNotificationsController,
  markReadController,
  subscribeController
} from "./controller.js";

export const notificationsRouter = async (app: FastifyInstance): Promise<void> => {
  app.post(
    "/subscribe",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("NOTIFICATIONS")
      ]
    },
    subscribeController
  );
  app.get(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("NOTIFICATIONS")
      ]
    },
    listNotificationsController
  );
  app.patch(
    "/:id/read",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("NOTIFICATIONS")
      ]
    },
    markReadController
  );
};
