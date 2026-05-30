import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const listAuditQuerySchema = z.object({
  actor: z.string().uuid().optional(),
  table: z.string().trim().max(60).optional(),
  recordId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
