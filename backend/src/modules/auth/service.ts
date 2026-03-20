// backend/src/modules/auth/service.ts
import type { RoleName, User } from "@prisma/client";
import type { FastifyError } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "../../shared/prisma.js";
import { env } from "../../shared/env.js";
import type { LoginInput, RegisterInput } from "./schema.js";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    roles: RoleName[];
  };
  tokens: AuthTokens;
}

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  jti?: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 7;

const loadRolesByUserId = async (userId: string): Promise<RoleName[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true }
  });
  return userRoles.map((entry) => entry.role.name);
};

const createTokens = async (user: User, roles: RoleName[]): Promise<AuthTokens> => {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    roles
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });

  // Add a unique id to prevent refresh token collisions when multiple refreshes
  // happen in the same second.
  const refreshToken = jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`
  });

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt
    }
  });

  return { accessToken, refreshToken };
};

export const register = async (input: RegisterInput): Promise<AuthResponse> => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error("Email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const clientRole = await prisma.role.findUnique({ where: { name: "CLIENT" } });
  if (!clientRole) {
    throw new Error("CLIENT role not found. Run seed first.");
  }

  if (input.routeId) {
    const route = await prisma.route.findUnique({ where: { id: input.routeId } });
    if (!route) {
      const err = new Error(
        "Route not found. Use a valid registration link (?routeId=...) or contact your route manager."
      ) as FastifyError;
      err.statusCode = 400;
      throw err;
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        roles: {
          create: {
            roleId: clientRole.id
          }
        }
      }
    });

    if (input.routeId) {
      await tx.routeClient.create({
        data: {
          routeId: input.routeId,
          clientId: created.id
        }
      });
    }

    return created;
  });

  const roles = await loadRolesByUserId(user.id);
  const tokens = await createTokens(user, roles);
  return {
    user: { id: user.id, name: user.name, email: user.email, roles },
    tokens
  };
};

export const login = async (input: LoginInput): Promise<AuthResponse> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (!user || !user.isActive) {
    throw new Error("Invalid credentials.");
  }

  const validPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!validPassword) {
    throw new Error("Invalid credentials.");
  }

  const roles = await loadRolesByUserId(user.id);
  const tokens = await createTokens(user, roles);
  return {
    user: { id: user.id, name: user.name, email: user.email, roles },
    tokens
  };
};

export const refresh = async (token: string): Promise<{ accessToken: string; refreshToken: string }> => {
  const dbToken = await prisma.refreshToken.findUnique({ where: { token } });
  if (!dbToken) {
    throw new Error("Invalid refresh token.");
  }

  if (dbToken.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.delete({ where: { token } });
    throw new Error("Refresh token expired.");
  }

  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  const roles = await loadRolesByUserId(payload.sub);

  const nextAccessToken = jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      roles
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );

  const nextRefreshToken = jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      roles,
      jti: randomUUID()
    },
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { token } }),
    prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        token: nextRefreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
      }
    })
  ]);

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken
  };
};

export const logout = async (token: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({
    where: { token }
  });
};
