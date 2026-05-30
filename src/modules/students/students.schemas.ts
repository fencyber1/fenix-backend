import { z } from 'zod';
import { paginationQuerySchema } from '@/utils/pagination';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const studentStatusEnum = z.enum([
  'ACTIVE',
  'INACTIVE',
  'GRADUATED',
  'SUSPENDED',
  'WITHDRAWN',
]);

export const createStudentSchema = z.object({
  studentNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dob: dateString,
  gender: genderEnum,
  admissionDate: dateString,
  status: studentStatusEnum.default('ACTIVE'),
  bloodGroup: z.string().trim().max(5).optional(),
  medicalNotes: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(300).optional(),
  photoUrl: z.string().url().max(500).optional(),
  classId: z.string().uuid().optional(),
  academicYear: z.string().trim().max(20).optional(),
});

export const updateStudentSchema = createStudentSchema.partial().omit({ classId: true, academicYear: true });

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  status: studentStatusEnum.optional(),
});

export const studentIdParamSchema = z.object({ id: z.string().uuid('Invalid student id') });

export const importStudentsSchema = z.object({
  csv: z.string().min(1, 'CSV content is required'),
  classId: z.string().uuid().optional(),
  academicYear: z.string().trim().max(20).optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
