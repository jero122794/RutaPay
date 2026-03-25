// backend/src/modules/payments/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { paymentIdempotencyPreHandler } from "../../middleware/idempotency.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import {
  verifyLoanOwnershipFromPaymentBody,
  verifyLoanOwnershipParam
} from "../../middleware/ownership.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  createPaymentController,
  listPaymentsByLoanController,
  listPaymentsController,
  reversePaymentController
} from "./controller.js";

export const paymentsRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["ADMIN", "SUPER_ADMIN", "ROUTE_MANAGER"]),
        moduleGuard("PAYMENTS")
      ]
    },
    listPaymentsController
  );
  app.post(
    "/",
    {
      preHandler: [
        authGuard,
        roleGuard(["ROUTE_MANAGER", "ADMIN", "SUPER_ADMIN"]),
        moduleGuard("PAYMENTS"),
        paymentIdempotencyPreHandler,
        verifyLoanOwnershipFromPaymentBody
      ]
    },
    createPaymentController
  );
  app.get(
    "/loan/:loanId",
    {
      preHandler: [
        authGuard,
        roleGuard(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]),
        moduleGuard("PAYMENTS"),
        verifyLoanOwnershipParam("loanId")
      ]
    },
    listPaymentsByLoanController
  );
  app.post(
    "/:id/reverse",
    {
      preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("PAYMENTS")]
    },
    reversePaymentController
  );
};
