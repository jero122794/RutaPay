// backend/src/shared/token-hash.ts
import { createHash } from "crypto";

export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");
