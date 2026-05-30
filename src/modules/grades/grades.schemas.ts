import { z } from 'zod';

export const upsertGradeSchema = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: z.string().trim().min(1).max(20),
  score: z.number().min(0).max(100000),
  maxScore: z.number().gt(0).max(100000),
  remark: z.string().trim().max(300).optional(),
}).refine((v) => v.score <= v.maxScore, {
  message: 'score cannot exceed maxScore',
  path: ['score'],
});

export const updateGradeSchema = z
  .object({
    score: z.number().min(0).max(100000),
    maxScore: z.number().gt(0).max(100000),
    remark: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.score <= v.maxScore, { message: 'score cannot exceed maxScore', path: ['score'] });

export const listGradesQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  term: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reportCardQuerySchema = z.object({
  studentId: z.string().uuid(),
  term: z.string().trim().min(1).max(20),
});

export const gradeIdParamSchema = z.object({ id: z.string().uuid() });

export type UpsertGradeInput = z.infer<typeof upsertGradeSchema>;
export type UpdateGradeInput = z.infer<typeof updateGradeSchema>;
export type ListGradesQuery = z.infer<typeof listGradesQuerySchema>;
export type ReportCardQuery = z.infer<typeof reportCardQuerySchema>;
