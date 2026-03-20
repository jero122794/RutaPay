// backend/src/modules/auth/router.ts
import type { FastifyInstance } from "fastify";
import {
  loginController,
  logoutController,
  refreshController,
  registerController
} from "./controller.js";

export const authRouter = async (app: FastifyInstance): Promise<void> => {
  app.post("/register", registerController);
  app.post("/login", loginController);
  app.post("/refresh", refreshController);
  app.post("/logout", logoutController);
};
