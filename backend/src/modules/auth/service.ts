// backend/src/modules/auth/service.ts
import type { AppModule, RoleName, User } from "@prisma/client";
import type { FastifyError } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "../../shared/prisma.js";
import { env } from "../../shared/env.js";
import { sanitizePlainText } from "../../shared/sanitize.js";
import {
  assertAccountNotLocked,
  clearUserLoginFailures,
  recordLoginFailureByIp,
  recordUserLoginFailure
} from "../../shared/login-security.js";
import { assertBusinessLicenseActiveForOperationalRoles, getBusinessLicenseStatus } from "../../shared/business-license.js";
import { hashRefreshToken } from "../../shared/token-hash.js";
import { loadModulesForRoles } from "../../shared/role-modules.js";
import type { LoginInput, RegisterInput } from "./schema.js";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthUserPayload {
  id: string;
  name: string;
  email: string;
  roles: RoleName[];
  businessId: string | null;
  modules: AppModule[];
}

interface AuthResponse {
  user: AuthUserPayload;
  tokens: AuthTokens;
  licenseWarning?: {
    endsAt: string;
    daysRemaining: number;
  };
}

interface JwtPayload {
  sub: string;
  email: string;
  roles: RoleName[];
  businessId: string | null;
  modules: AppModule[];
  jti?: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 7;

let dummyPasswordHash: string | null = null;
const getDummyPasswordHash = (): string => {
  if (!dummyPasswordHash) {
    dummyPasswordHash = bcrypt.hashSync("__login_timing_dummy__", 12);
  }
  return dummyPasswordHash;
};

const invalidCreds = (): FastifyError => {
  const err = new Error("Credenciales inválidas.") as FastifyError;
  err.statusCode = 401;
  err.name = "Unauthorized";
  return err;
};

const loadRolesByUserId = async (userId: string): Promise<RoleName[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true }
  });
  return userRoles.map((entry) => entry.role.name);
};

const buildAuthUserPayload = async (user: User, roles: RoleName[]): Promise<AuthUserPayload> => {
  const modules = await loadModulesForRoles(roles);
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? "",
    roles,
    businessId: user.businessId ?? null,
    modules
  };
};

const createTokens = async (user: User, roles: RoleName[]): Promise<AuthTokens> => {
  const modules = await loadModulesForRoles(roles);
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email ?? "",
    roles,
    businessId: user.businessId ?? null,
    modules
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });

  const refreshToken = jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`
  });

  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  return { accessToken, refreshToken };
};

export const register = async (input: RegisterInput): Promise<AuthResponse> => {
  const normalizedEmail = input.email?.trim()
    ? input.email.trim().toLowerCase()
    : `${input.documentId}@cliente.local`;

  const existingByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingByEmail) {
    throw new Error("Email already exists.");
  }

  const existingDocument = await prisma.user.findFirst({ where: { documentId: input.documentId } });
  if (existingDocument) {
    throw new Error("Document already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const clientRole = await prisma.role.findUnique({ where: { name: "CLIENT" } });
  if (!clientRole) {
    throw new Error("CLIENT role not found. Run seed first.");
  }

  let routeBusinessId: string | null = null;
  if (input.routeId) {
    const route = await prisma.route.findUnique({ where: { id: input.routeId } });
    if (!route) {
      const err = new Error(
        "Route not found. Use a valid registration link (?routeId=...) or contact your route manager."
      ) as FastifyError;
      err.statusCode = 400;
      throw err;
    }
    routeBusinessId = route.businessId ?? null;
  }

  let address: string | null = null;
  if (input.address !== undefined && input.address.trim() !== "") {
    address = sanitizePlainText(input.address) ?? null;
  }
  let description: string | null = null;
  if (input.description !== undefined && input.description.trim() !== "") {
    description = sanitizePlainText(input.description) ?? null;
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: normalizedEmail,
        phone: input.phone,
        address,
        description,
        documentId: input.documentId,
        passwordHash,
        businessId: routeBusinessId,
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
  const authUser = await buildAuthUserPayload(user, roles);
  return { user: authUser, tokens };
};

export const login = async (
  input: LoginInput,
  _meta: { ip: string; userAgent: string }
): Promise<AuthResponse> => {
  const normalizedIdentifier = input.identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ documentId: input.identifier.trim() }, { email: normalizedIdentifier }]
    }
  });

  if (!user) {
    await recordLoginFailureByIp(_meta.ip);
    await bcrypt.compare(input.password, getDummyPasswordHash());
    throw invalidCreds();
  }

  await assertAccountNotLocked(user.id);

  if (!user.isActive) {
    await recordLoginFailureByIp(_meta.ip);
    await bcrypt.compare(input.password, getDummyPasswordHash());
    throw invalidCreds();
  }

  if (!user.passwordHash) {
    await bcrypt.compare(input.password, getDummyPasswordHash());
    await recordLoginFailureByIp(_meta.ip);
    throw invalidCreds();
  }

  const validPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!validPassword) {
    await recordUserLoginFailure(user.id);
    await recordLoginFailureByIp(_meta.ip);
    throw invalidCreds();
  }

  await clearUserLoginFailures(user.id);

  const roles = await loadRolesByUserId(user.id);

  if (user.businessId) {
    await assertBusinessLicenseActiveForOperationalRoles(user.businessId, roles);
  }

  const tokens = await createTokens(user, roles);
  const authUser = await buildAuthUserPayload(user, roles);

  const isAdmin = roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN");
  if (isAdmin && user.businessId) {
    const status = await getBusinessLicenseStatus(user.businessId);
    if (status.hasLicense && status.endsAt && typeof status.daysRemaining === "number") {
      if (status.daysRemaining <= 30 && status.daysRemaining > 0) {
        return {
          user: authUser,
          tokens,
          licenseWarning: {
            endsAt: status.endsAt.toISOString(),
            daysRemaining: status.daysRemaining
          }
        };
      }
    }
  }

  return { user: authUser, tokens };
};

export const refresh = async (token: string): Promise<{ accessToken: string; refreshToken: string }> => {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    const err = new Error("Credenciales inválidas.") as FastifyError;
    err.statusCode = 401;
    err.name = "Unauthorized";
    throw err;
  }

  const tokenHash = hashRefreshToken(token);
  const dbToken = await prisma.refreshToken.findUnique({
    where: { tokenHash }
  });

  if (!dbToken) {
    await prisma.refreshToken.deleteMany({ where: { userId: payload.sub } });
    const err = new Error("Sesión inválida. Inicie sesión de nuevo.") as FastifyError;
    err.statusCode = 401;
    err.name = "Unauthorized";
    throw err;
  }

  if (dbToken.userId !== payload.sub) {
    await prisma.refreshToken.deleteMany({ where: { userId: payload.sub } });
    const err = new Error("Sesión inválida. Inicie sesión de nuevo.") as FastifyError;
    err.statusCode = 401;
    err.name = "Unauthorized";
    throw err;
  }

  if (dbToken.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.delete({ where: { id: dbToken.id } });
    const err = new Error("Sesión expirada. Inicie sesión de nuevo.") as FastifyError;
    err.statusCode = 401;
    err.name = "Unauthorized";
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    await prisma.refreshToken.delete({ where: { id: dbToken.id } });
    const err = new Error("Sesión inválida. Inicie sesión de nuevo.") as FastifyError;
    err.statusCode = 401;
    err.name = "Unauthorized";
    throw err;
  }

  const roles = await loadRolesByUserId(payload.sub);
  if (user.businessId) {
    await assertBusinessLicenseActiveForOperationalRoles(user.businessId, roles);
  }
  const modules = await loadModulesForRoles(roles);

  const nextPayload: JwtPayload = {
    sub: user.id,
    email: user.email ?? "",
    roles,
    businessId: user.businessId ?? null,
    modules
  };

  const nextAccessToken = jwt.sign(nextPayload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });

  const nextRefreshToken = jwt.sign(
    {
      ...nextPayload,
      jti: randomUUID()
    },
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );

  const nextHash = hashRefreshToken(nextRefreshToken);
  const nextExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { id: dbToken.id } }),
    prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: nextHash,
        expiresAt: nextExpiresAt
      }
    })
  ]);

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken
  };
};

export const logout = async (token: string): Promise<{ userId: string | null }> => {
  let userId: string | null = null;
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
    userId = decoded.sub;
  } catch {
    // Invalid token; still attempt hash-based cleanup below.
  }

  const tokenHash = hashRefreshToken(token);
  await prisma.refreshToken.deleteMany({
    where: { tokenHash }
  });

  return { userId };
};

export const listRoutesForRegistration = async (): Promise<{ id: string; name: string }[]> => {
  return prisma.route.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });
};
