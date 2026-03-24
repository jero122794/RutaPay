// backend/src/shared/pagination.schema.ts
import type { FastifyRequest } from "fastify";
import { z } from "zod";

export const ALLOWED_LIMITS = [10, 20, 50, 100] as const;
export type AllowedLimit = (typeof ALLOWED_LIMITS)[number];

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n): n is AllowedLimit => (ALLOWED_LIMITS as readonly number[]).includes(n), {
      message: "limit must be 10, 20, 50, or 100"
    })
    .default(10)
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const hasPaginationParams = (query: FastifyRequest["query"]): boolean => {
  if (query === null || typeof query !== "object") {
    return false;
  }
  const q = query as Record<string, unknown>;
  const pageRaw = q.page;
  const limitRaw = q.limit;
  const hasPage =
    pageRaw !== undefined && pageRaw !== null && String(pageRaw).trim() !== "";
  const hasLimit =
    limitRaw !== undefined && limitRaw !== null && String(limitRaw).trim() !== "";
  return hasPage || hasLimit;
};

export const parseOptionalPaginationQuery = (
  query: FastifyRequest["query"]
): PaginationQuery | null => {
  if (!hasPaginationParams(query)) {
    return null;
  }
  return paginationQuerySchema.parse(query);
};

export const slicePage = <T>(
  items: T[],
  page: number,
  limit: number
): { data: T[]; page: number } => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * limit;
  return {
    data: items.slice(skip, skip + limit),
    page: safePage
  };
};

export const prismaPaginationBounds = (
  total: number,
  requestedPage: number,
  limit: number
): { skip: number; take: number; page: number } => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return {
    skip: (page - 1) * limit,
    take: limit,
    page
  };
};
