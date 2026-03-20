// backend/src/modules/auth/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { loginSchema, refreshSchema, registerSchema } from "./schema.js";
import * as authService from "./service.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth"
};

export const registerController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const input = registerSchema.parse(request.body);
  const result = await authService.register(input);

  reply.setCookie("refreshToken", result.tokens.refreshToken, {
    ...refreshCookieOptions,
    maxAge: 7 * 24 * 60 * 60
  });

  reply.code(201).send({
    data: {
      user: result.user,
      accessToken: result.tokens.accessToken
    },
    message: "User registered successfully."
  });
};

export const loginController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(input);

  reply.setCookie("refreshToken", result.tokens.refreshToken, {
    ...refreshCookieOptions,
    maxAge: 7 * 24 * 60 * 60
  });

  reply.send({
    data: {
      user: result.user,
      accessToken: result.tokens.accessToken
    },
    message: "Login successful."
  });
};

export const refreshController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const body = refreshSchema.parse(request.body);
  const cookieToken = request.cookies.refreshToken;
  const token = body.refreshToken ?? cookieToken;
  if (!token) {
    reply.code(400).send({
      statusCode: 400,
      error: "Bad Request",
      message: "Refresh token is required."
    });
    return;
  }

  const result = await authService.refresh(token);
  reply.setCookie("refreshToken", result.refreshToken, {
    ...refreshCookieOptions,
    maxAge: 7 * 24 * 60 * 60
  });
  reply.send({
    data: { accessToken: result.accessToken },
    message: "Access token refreshed."
  });
};

export const logoutController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const cookieToken = request.cookies.refreshToken;
  if (cookieToken) {
    await authService.logout(cookieToken);
  }

  reply.clearCookie("refreshToken", {
    ...refreshCookieOptions
  });

  reply.send({
    data: true,
    message: "Logout successful."
  });
};
