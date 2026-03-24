// backend/src/shared/sanitize.ts
import striptags from "striptags";

/**
 * Sanitize free-text fields to reduce stored XSS risk (A03).
 * Uses striptags (no jsdom) — avoids ERR_REQUIRE_ESM from isomorphic-dompurify's stack on Node 18.
 */
export const sanitizePlainText = (input: string | undefined | null): string | undefined => {
  if (input === undefined || input === null) {
    return undefined;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return striptags(trimmed);
};
