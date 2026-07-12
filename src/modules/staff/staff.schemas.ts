import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const staffSystemRoleEnum = z.enum(['ADMIN', 'TEACHER']);

export const createStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(60),
  systemRole: staffSystemRoleEnum.default('TEACHER'),
  department: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  joinDate: dateString,
});

export const updateStaffSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(40).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().min(1).max(60).optional(),
  department: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  photoUrl: z.string().url().max(500).optional(),
});

export const listStaffQuerySchema = paginationQuerySchema.extend({
  department: z.string().trim().max(80).optional(),
});

export const staffIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
