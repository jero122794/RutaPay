// frontend/lib/api.ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { syncAuthStoreFromAccessToken } from "./effective-roles";
import { useAuthStore } from "../store/authStore";

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface RefreshResponse {
  data: {
    accessToken: string;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const ACCESS_TOKEN_STORAGE_KEY = "loan-app-access-token";
const SESSION_COOKIE_NAME = "rp_session";

let accessToken = "";

/** Mirrors access token presence for Next.js middleware (not httpOnly; API auth remains Bearer). */
const syncSessionCookie = (hasToken: boolean): void => {
  if (typeof document === "undefined") {
    return;
  }
  if (hasToken) {
    // Browser flag for Next middleware (not the access token); refresh flow keeps API auth valid longer.
    document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
  } else {
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
};

// Restore persisted access token for cases where the app reloads.
if (typeof window !== "undefined") {
  const stored = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (stored) {
    accessToken = stored;
    syncSessionCookie(true);
  }
}

export const setAccessToken = (token: string): void => {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      syncSessionCookie(true);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      syncSessionCookie(false);
    }
  }
};

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

const shouldSkipTokenRefresh = (config: InternalAxiosRequestConfig): boolean => {
  const url = config.url ?? "";
  // Never refresh on auth endpoints: login/register 401 must not loop; refresh 401 must not recurse.
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/logout")
  );
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as RetryConfig | undefined;
    if (!originalConfig || originalConfig._retry || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    if (shouldSkipTokenRefresh(originalConfig)) {
      return Promise.reject(error);
    }

    originalConfig._retry = true;
    try {
      const refresh = await api.post<RefreshResponse>("/auth/refresh", {});
      const newToken = refresh.data.data.accessToken;
      setAccessToken(newToken);
      syncAuthStoreFromAccessToken(newToken, useAuthStore.getState().setUser, useAuthStore.getState().user);
      originalConfig.headers.Authorization = `Bearer ${newToken}`;
      return api(originalConfig);
    } catch (refreshError) {
      setAccessToken("");
      return Promise.reject(refreshError);
    }
  }
);

export default api;
