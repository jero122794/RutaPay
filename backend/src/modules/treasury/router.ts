// backend/src/modules/treasury/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  approveLiquidationReviewController,
  creditRouteController,
  getLiquidationController,
  getMyLiquidationReviewController,
  getRouteBalanceController,
  listLiquidationReviewsController,
  rejectLiquidationReviewController,
  submitLiquidationReviewController
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
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"])] },
    getLiquidationController
  );
  app.get(
    "/liquidation-reviews",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    listLiquidationReviewsController
  );
  app.get(
    "/liquidation-reviews/me",
    { preHandler: [authGuard, roleGuard(["ROUTE_MANAGER"])] },
    getMyLiquidationReviewController
  );
  app.post(
    "/liquidation-reviews/submit",
    { preHandler: [authGuard, roleGuard(["ROUTE_MANAGER"])] },
    submitLiquidationReviewController
  );
  app.post(
    "/liquidation-reviews/:managerId/approve",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    approveLiquidationReviewController
  );
  app.post(
    "/liquidation-reviews/:managerId/reject",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    rejectLiquidationReviewController
  );
};
