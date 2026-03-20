// backend/src/modules/routes/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
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
  app.get("/", { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] }, listRoutesController);
  app.get("/me", { preHandler: [authGuard, roleGuard(["ROUTE_MANAGER"])] }, listMyRoutesController);
  app.post("/", { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] }, createRouteController);
  app.get(
    "/:id",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"])] },
    getRouteByIdController
  );
  app.patch("/:id", { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] }, updateRouteController);
  app.post(
    "/:id/balance",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    addBalanceController
  );
  app.get(
    "/:id/summary",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    getRouteSummaryController
  );
};
