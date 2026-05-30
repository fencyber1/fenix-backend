import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

export const createClassSchema = z.object({
  name: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(40),
  academicYear: z.string().trim().min(1).max(20),
  classTeacherId: z.string().uuid().optional(),
  capacity: z.number().int().min(1).max(500).default(40),
});

export const updateClassSchema = createClassSchema.partial();

export const listClassesQuerySchema = paginationQuerySchema.extend({
  academicYear: z.string().trim().max(20).optional(),
});

export const classIdParamSchema = z.object({ id: z.string().uuid() });

export const enrollStudentSchema = z.object({
  studentId: z.string().uuid(),
  academicYear: z.string().trim().max(20).optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;
