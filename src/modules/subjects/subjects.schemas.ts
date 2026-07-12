import { z } from 'zod';

export const createSubjectSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(500).optional(),
  teacherId: z.string().uuid().optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  code: z.string().trim().min(1).max(20).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  teacherId: z.string().uuid().nullable().optional(),
});

export const listSubjectsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
});

export const subjectIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
