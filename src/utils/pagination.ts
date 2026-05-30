import { z } from 'zod';

/**
 * Reusable query-param schema for server-side pagination, sorting and search.
 * `sortBy` is validated against an allow-list per module to prevent injection
 * into Prisma orderBy.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().trim().max(60).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface ResolvedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function resolvePagination(q: { page: number; limit: number }): ResolvedPagination {
  return { page: q.page, limit: q.limit, skip: (q.page - 1) * q.limit, take: q.limit };
}

/**
 * Returns a safe Prisma orderBy object, falling back to a default field when the
 * requested sortBy is not in the allow-list.
 */
export function buildOrderBy<TField extends string>(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
  allowed: readonly TField[],
  defaultField: TField,
): Record<string, 'asc' | 'desc'> {
  const field = sortBy && (allowed as readonly string[]).includes(sortBy) ? sortBy : defaultField;
  return { [field]: sortOrder };
}

// Re-exported for convenience so modules can import pagination helpers + meta
// builder from a single path.
export { buildPaginationMeta, type PaginationMeta } from './http';
