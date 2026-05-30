import type { Response } from 'express';

/** Standard success envelope. */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiPaginated<T> {
  success: true;
  message: string;
  data: T[];
  meta: PaginationMeta;
}

export function ok<T>(res: Response, data: T, message = 'OK', status = 200): Response {
  const body: ApiSuccess<T> = { success: true, message, data };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, message = 'Created'): Response {
  return ok(res, data, message, 201);
}

export function paginated<T>(
  res: Response,
  items: T[],
  meta: PaginationMeta,
  message = 'OK',
): Response {
  const body: ApiPaginated<T> = { success: true, message, data: items, meta };
  return res.status(200).json(body);
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
