// backend/src/modules/loans/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { verifyLoanOwnershipParam } from "../../middleware/ownership.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  calculateLoanController,
  createLoanController,
  deleteLoanController,
  getLoanByIdController,
  getLoanScheduleController,
  listLoansController,
  updateLoanStatusController,
  updateLoanTermsController
} from "./controller.js";

export const loansRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("LOANS")
      ]
    },
    listLoansController
  );
  app.post(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"]),
        moduleGuard("LOANS")
      ]
    },
    createLoanController
  );
  app.get(
    "/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("LOANS"),
        verifyLoanOwnershipParam("id")
      ]
    },
    getLoanByIdController
  );
  app.patch(
    "/:id/status",
    {
      preHandler: [authGuard, roleGuard(["ADMIN", "SUPER_ADMIN"]), moduleGuard("LOANS")]
    },
    updateLoanStatusController
  );
  app.patch(
    "/:id/terms",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN"]),
        moduleGuard("LOANS"),
        verifyLoanOwnershipParam("id")
      ]
    },
    updateLoanTermsController
  );
  app.delete(
    "/:id",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN"]),
        moduleGuard("LOANS"),
        verifyLoanOwnershipParam("id")
      ]
    },
    deleteLoanController
  );
  app.get(
    "/:id/schedule",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("LOANS"),
        verifyLoanOwnershipParam("id")
      ]
    },
    getLoanScheduleController
  );
  app.post(
    "/calculate",
    {
      preHandler: [
        authGuard,
        roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"]),
        moduleGuard("LOANS")
      ]
    },
    calculateLoanController
  );
};
