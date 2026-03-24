// frontend/lib/effective-roles.ts
import type { UserRole } from "../store/authStore";

const ACCESS_TOKEN_STORAGE_KEY = "loan-app-access-token";

const KNOWN_ROLES = new Set<UserRole>(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"]);

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) {
      base64 += "=".repeat(4 - pad);
    }
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const rolesFromPayload = (payload: Record<string, unknown> | null): UserRole[] => {
  if (!payload || !Array.isArray(payload.roles)) {
    return [];
  }
  const out: UserRole[] = [];
  for (const r of payload.roles) {
    if (typeof r === "string" && KNOWN_ROLES.has(r as UserRole)) {
      out.push(r as UserRole);
    }
  }
  return out;
};

/** Reads role names embedded in the access JWT (client-side hint only; API still enforces auth). */
export const parseRolesFromStoredAccessToken = (): UserRole[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (!token) {
    return [];
  }
  return rolesFromPayload(decodeJwtPayload(token));
};

/**
 * Merges persisted user.roles with JWT payload roles so UI matches the token after refresh
 * or if the persisted store is missing/outdated role entries.
 */
export const getEffectiveRoles = (user: { roles?: UserRole[] } | null): UserRole[] => {
  const fromStore = user?.roles ?? [];
  const fromToken = parseRolesFromStoredAccessToken();
  if (fromToken.length === 0) {
    return fromStore;
  }
  if (fromStore.length === 0) {
    return fromToken;
  }
  return [...new Set<UserRole>([...fromStore, ...fromToken])];
};
