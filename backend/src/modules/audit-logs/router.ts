// backend/src/modules/audit-logs/router.ts
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../middleware/auth.middleware.js";
import { moduleGuard } from "../../middleware/module.middleware.js";
import { roleGuard } from "../../middleware/role.middleware.js";
import { listAuditLogsController } from "./controller.js";

export const auditLogsRouter = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/",
    {
      preHandler: [authGuard, roleGuard(["SUPER_ADMIN", "ADMIN"]), moduleGuard("OVERVIEW")]
    },
    listAuditLogsController
  );
};

