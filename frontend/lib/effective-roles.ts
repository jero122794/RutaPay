// frontend/lib/effective-roles.ts
import type { AppModuleKey, UserRole } from "../store/authStore";
import { useAuthStore } from "../store/authStore";

const ROLE_PRIORITY: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"];

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
 *
 * JWT roles are ignored until `hasAuthHydrated` is true so the first client render matches SSR
 * (no localStorage on the server). Prevents hydration mismatches on role-gated <Link> trees.
 *
 * TanStack Query `enabled` flags should include `hasAuthHydrated` (and usually `user`) so API
 * calls do not run with stale role hints before this merge runs.
 */
export const getEffectiveRoles = (user: { roles?: UserRole[] } | null): UserRole[] => {
  const fromStore = user?.roles ?? [];
  const canReadToken =
    typeof window !== "undefined" && useAuthStore.getState().hasAuthHydrated;
  const fromToken = canReadToken ? parseRolesFromStoredAccessToken() : [];
  if (fromToken.length === 0) {
    return fromStore;
  }
  if (fromStore.length === 0) {
    return fromToken;
  }
  return [...new Set<UserRole>([...fromStore, ...fromToken])];
};

/**
 * Picks one role for UI when multiple may appear in the store (order is not guaranteed).
 * Prefer higher-privilege roles so ROUTE_MANAGER dashboards do not fall through to CLIENT.
 */
export const pickPrimaryRole = (roles: UserRole[] | undefined): UserRole => {
  if (!roles || roles.length === 0) {
    return "CLIENT";
  }
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) {
      return r;
    }
  }
  return roles[0];
};

interface JwtPayloadShape {
  sub?: string;
  email?: string;
  roles?: string[];
  modules?: string[];
  businessId?: string | null;
}

export const decodeAccessTokenPayload = (token: string): JwtPayloadShape | null => {
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
    return JSON.parse(json) as JwtPayloadShape;
  } catch {
    return null;
  }
};

export const syncAuthStoreFromAccessToken = (
  token: string,
  setUser: (u: {
    id: string;
    name: string;
    email: string;
    roles: UserRole[];
    modules: AppModuleKey[];
    businessId: string | null;
  }) => void,
  currentUser: {
    id: string;
    name: string;
    email: string;
    roles: UserRole[];
    modules: AppModuleKey[];
    businessId: string | null;
  } | null
): void => {
  const payload = decodeAccessTokenPayload(token);
  if (!payload?.sub || !currentUser || payload.sub !== currentUser.id) {
    return;
  }
  const roles: UserRole[] = [];
  if (Array.isArray(payload.roles)) {
    for (const r of payload.roles) {
      if (typeof r === "string" && KNOWN_ROLES.has(r as UserRole)) {
        roles.push(r as UserRole);
      }
    }
  }
  const modules: AppModuleKey[] = [];
  if (Array.isArray(payload.modules)) {
    for (const m of payload.modules) {
      if (typeof m === "string") {
        modules.push(m as AppModuleKey);
      }
    }
  }
  setUser({
    ...currentUser,
    roles: roles.length > 0 ? roles : currentUser.roles,
    modules: modules.length > 0 ? modules : currentUser.modules,
    businessId: payload.businessId !== undefined ? (payload.businessId as string | null) : currentUser.businessId
  });
};
