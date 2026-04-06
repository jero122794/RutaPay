// backend/src/modules/businesses/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import {
  assignBusinessMemberController,
  createBusinessController,
  createFirstBusinessAdminController,
  getBusinessByIdController,
  listAssignableUsersController,
  listBusinessesController,
  reconcileBusinessScopeController,
  removeBusinessMemberController,
  setBusinessLicenseController,
  updateBusinessController
} from "./controller.js";

export const businessesRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/assignable-users",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    listAssignableUsersController
  );
  app.get(
    "/",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    listBusinessesController
  );
  app.post(
    "/",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    createBusinessController
  );
  app.get(
    "/:id",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    getBusinessByIdController
  );
  app.patch(
    "/:id",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    updateBusinessController
  );
  app.post(
    "/:id/license",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    setBusinessLicenseController
  );
  app.post(
    "/:id/first-admin",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    createFirstBusinessAdminController
  );
  app.post(
    "/:id/reconcile-scope",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    reconcileBusinessScopeController
  );
  app.post(
    "/:id/members",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    assignBusinessMemberController
  );
  app.delete(
    "/:id/members/:userId",
    { preHandler: [authGuard, roleGuard(["SUPER_ADMIN"]), moduleGuard("BUSINESSES")] },
    removeBusinessMemberController
  );
};
