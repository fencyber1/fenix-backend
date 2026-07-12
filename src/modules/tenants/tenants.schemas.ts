import { z } from 'zod';

export const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  academicYearStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
    .optional(),
  timezone: z.string().trim().max(60).optional(),
});

export const notificationPrefSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.enum(['ATTENDANCE_ALERT', 'FEE_REMINDER', 'REPORT_CARD', 'GENERAL', 'ACCOUNT']),
        channel: z.enum(['IN_APP', 'EMAIL', 'SMS']),
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(50),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type NotificationPrefInput = z.infer<typeof notificationPrefSchema>;
