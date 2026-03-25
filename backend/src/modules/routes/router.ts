// backend/src/modules/routes/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  addBalanceController,
  createRouteController,
  getRouteByIdController,
  getRouteSummaryController,
  listRoutesController,
  listMyRoutesController,
  updateRouteController
} from "./controller.js";

export const routesRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("ROUTES")]
    },
    listRoutesController
  );
  app.get(
    "/me",
    {
      preHandler: [authGuard, roleGuard(["ROUTE_MANAGER"]), moduleGuard("ROUTES")]
    },
    listMyRoutesController
  );
  app.post(
    "/",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("ROUTES")]
    },
    createRouteController
  );
  app.get(
    "/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"]),
        moduleGuard("ROUTES")
      ]
    },
    getRouteByIdController
  );
  app.patch(
    "/:id",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("ROUTES")]
    },
    updateRouteController
  );
  app.post(
    "/:id/balance",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("ROUTES")]
    },
    addBalanceController
  );
  app.get(
    "/:id/summary",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"]),
        moduleGuard("ROUTES")
      ]
    },
    getRouteSummaryController
  );
};
