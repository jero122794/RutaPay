// backend/src/shared/redis.ts
import Redis from "ioredis";
import { env } from "./env.js";

const RedisClient = Redis.default ?? Redis;

export const redis = new RedisClient(env.REDIS_URL, {
  maxRetriesPerRequest: 2
});
