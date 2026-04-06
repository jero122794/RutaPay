// backend/src/modules/auth/controller.ts
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import {
  clientIp,
  maskIdentifierTail,
  userAgentHeader,
  writeAuditLog
} from "../../shared/audit.js";
import { loginSchema, refreshSchema, registerSchema } from "./schema.js";
import * as authService from "./service.js";

export const listRegisterRoutesController = async (
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const routes = await authService.listRoutesForRegistration();
  reply.send({ data: routes });
};

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

  const ip = clientIp(request);
  const ua = userAgentHeader(request);
  await writeAuditLog({
    userId: result.user.id,
    action: "REGISTER_SUCCESS",
    resourceType: "auth",
    resourceId: result.user.id,
    ip,
    userAgent: ua
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
  const ip = clientIp(request);
  const ua = userAgentHeader(request);

  try {
    const result = await authService.login(input, { ip, userAgent: ua });

    await writeAuditLog({
      userId: result.user.id,
      action: "LOGIN_SUCCESS",
      resourceType: "auth",
      resourceId: result.user.id,
      ip,
      userAgent: ua
    });

    reply.setCookie("refreshToken", result.tokens.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 7 * 24 * 60 * 60
    });

    reply.send({
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        ...(result.licenseWarning ? { licenseWarning: result.licenseWarning } : {})
      },
      message: "Login successful."
    });
  } catch (error) {
    const err = error as FastifyError;
    if (err.statusCode === 401) {
      await writeAuditLog({
        userId: null,
        action: "LOGIN_FAILED",
        resourceType: "auth",
        newValue: { identifierSuffix: maskIdentifierTail(input.identifier) },
        ip,
        userAgent: ua
      });
    }
    if (err.statusCode === 429) {
      await writeAuditLog({
        userId: null,
        action: "LOGIN_RATE_LIMITED",
        resourceType: "auth",
        newValue: { identifierSuffix: maskIdentifierTail(input.identifier) },
        ip,
        userAgent: ua
      });
    }
    throw error;
  }
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
  const ip = clientIp(request);
  const ua = userAgentHeader(request);

  if (cookieToken) {
    const { userId } = await authService.logout(cookieToken);
    if (userId) {
      await writeAuditLog({
        userId,
        action: "LOGOUT",
        resourceType: "auth",
        resourceId: userId,
        ip,
        userAgent: ua
      });
    }
  }

  reply.clearCookie("refreshToken", {
    ...refreshCookieOptions
  });

  reply.send({
    data: true,
    message: "Logout successful."
  });
};
