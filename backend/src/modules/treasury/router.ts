// backend/src/modules/treasury/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
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
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "ROUTE_MANAGER"]), moduleGuard("TREASURY")]
    },
    getRouteBalanceController
  );
  app.post(
    "/credit",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("TREASURY")]
    },
    creditRouteController
  );
  app.get(
    "/liquidation/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"]),
        moduleGuard("TREASURY")
      ]
    },
    getLiquidationController
  );
  app.get(
    "/liquidation-reviews",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("TREASURY")]
    },
    listLiquidationReviewsController
  );
  app.get(
    "/liquidation-reviews/me",
    {
      preHandler: [authGuard, roleGuard(["ROUTE_MANAGER"]), moduleGuard("TREASURY")]
    },
    getMyLiquidationReviewController
  );
  app.post(
    "/liquidation-reviews/submit",
    {
      preHandler: [authGuard, roleGuard(["ROUTE_MANAGER"]), moduleGuard("TREASURY")]
    },
    submitLiquidationReviewController
  );
  app.post(
    "/liquidation-reviews/:managerId/approve",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("TREASURY")]
    },
    approveLiquidationReviewController
  );
  app.post(
    "/liquidation-reviews/:managerId/reject",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("TREASURY")]
    },
    rejectLiquidationReviewController
  );
};
