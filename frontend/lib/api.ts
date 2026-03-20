// frontend/lib/api.ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

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

let accessToken = "";

// Restore persisted access token for cases where the app reloads.
if (typeof window !== "undefined") {
  const stored = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (stored) {
    accessToken = stored;
  }
}

export const setAccessToken = (token: string): void => {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
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

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as RetryConfig | undefined;
    if (!originalConfig || originalConfig._retry || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    originalConfig._retry = true;
    try {
      const refresh = await api.post<RefreshResponse>("/auth/refresh", {});
      setAccessToken(refresh.data.data.accessToken);
      originalConfig.headers.Authorization = `Bearer ${refresh.data.data.accessToken}`;
      return api(originalConfig);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

export default api;
