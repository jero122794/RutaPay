// backend/src/shared/login-security.ts
import type { FastifyError } from "fastify";
import { redis } from "./redis.js";

const LOCK_PREFIX = "account_lock:";
const FAIL_PREFIX = "login_fail:";

export const assertAccountNotLocked = async (userId: string): Promise<void> => {
  try {
    const locked = await redis.get(`${LOCK_PREFIX}${userId}`);
    if (locked) {
      const err = new Error("Demasiados intentos. Espere 15 minutos.") as FastifyError;
      err.statusCode = 429;
      err.name = "Too Many Requests";
      throw err;
    }
  } catch (error) {
    const fe = error as FastifyError;
    if (fe.statusCode === 429) {
      throw fe;
    }
    // Redis unavailable: do not block login
  }
};

export const recordUserLoginFailure = async (userId: string): Promise<void> => {
  try {
    const key = `${FAIL_PREFIX}${userId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 15 * 60);
    }
    if (count >= 5) {
      await redis.set(`${LOCK_PREFIX}${userId}`, "1", "EX", 15 * 60);
      await redis.del(key);
      const err = new Error("Demasiados intentos. Espere 15 minutos.") as FastifyError;
      err.statusCode = 429;
      err.name = "Too Many Requests";
      throw err;
    }
  } catch (error) {
    const fe = error as FastifyError;
    if (fe.statusCode === 429) {
      throw fe;
    }
    // Redis unavailable: skip lockout accounting
  }
};

export const clearUserLoginFailures = async (userId: string): Promise<void> => {
  try {
    await redis.del(`${FAIL_PREFIX}${userId}`);
  } catch {
    // ignore
  }
};

export const recordLoginFailureByIp = async (ip: string): Promise<void> => {
  try {
    const key = `login_fail_ip:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 5 * 60);
    }
    if (count >= 5) {
      console.warn("security_alert_many_failed_logins_ip", { ip });
    }
  } catch {
    // ignore
  }
};
