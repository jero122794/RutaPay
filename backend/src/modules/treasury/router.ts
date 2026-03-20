// backend/src/modules/treasury/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  creditRouteController,
  getLiquidationController,
  getRouteBalanceController
} from "./controller.js";

export const treasuryRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/balance/:routeId",
    { preHandler: [authGuard, roleGuard(["ADMIN", "ROUTE_MANAGER"])] },
    getRouteBalanceController
  );
  app.post(
    "/credit",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    creditRouteController
  );
  app.get(
    "/liquidation/:id",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    getLiquidationController
  );
};
