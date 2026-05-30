import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const attendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export const bulkMarkSchema = z.object({
  classId: z.string().uuid(),
  date: dateString,
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: attendanceStatusEnum,
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, 'At least one attendance record is required')
    .max(200, 'Too many records in a single request'),
});

export const listAttendanceQuerySchema = z
  .object({
    studentId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((v) => v.studentId || v.classId, {
    message: 'Provide studentId or classId',
    path: ['classId'],
  });

export const correctAttendanceSchema = z.object({
  status: attendanceStatusEnum,
  note: z.string().trim().max(300).optional(),
});

export const attendanceReportQuerySchema = z.object({
  classId: z.string().uuid(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
});

export const attendanceIdParamSchema = z.object({ id: z.string().uuid() });

export type BulkMarkInput = z.infer<typeof bulkMarkSchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type CorrectAttendanceInput = z.infer<typeof correctAttendanceSchema>;
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;
