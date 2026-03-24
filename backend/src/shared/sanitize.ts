// backend/src/shared/sanitize.ts
import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize free-text fields to reduce stored XSS risk (A03).
 */
export const sanitizePlainText = (input: string | undefined | null): string | undefined => {
  if (input === undefined || input === null) {
    return undefined;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return DOMPurify.sanitize(trimmed, { ALLOWED_TAGS: [] });
};
