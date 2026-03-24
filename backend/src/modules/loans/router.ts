// backend/src/modules/loans/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { verifyLoanOwnershipParam } from "../../middleware/ownership.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  calculateLoanController,
  createLoanController,
  getLoanByIdController,
  getLoanScheduleController,
  listLoansController,
  updateLoanStatusController
} from "./controller.js";

export const loansRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER", "CLIENT"])] },
    listLoansController
  );
  app.post(
    "/",
    { preHandler: [authGuard, roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"])] },
    createLoanController
  );
  app.get(
    "/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        verifyLoanOwnershipParam("id")
      ]
    },
    getLoanByIdController
  );
  app.patch(
    "/:id/status",
    { preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"])] },
    updateLoanStatusController
  );
  app.get(
    "/:id/schedule",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        verifyLoanOwnershipParam("id")
      ]
    },
    getLoanScheduleController
  );
  app.post(
    "/calculate",
    { preHandler: [authGuard, roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"])] },
    calculateLoanController
  );
};
