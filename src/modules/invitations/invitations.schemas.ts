import { z } from 'zod';

export const inviteUserSchema = z.object({
  role: z.enum(['TEACHER', 'STUDENT', 'PARENT']),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  name: z.string().trim().min(1, 'Name is required').max(200),
  roleData: z.record(z.unknown()).optional(),
});

export const registerWithTokenSchema = z.object({
  token: z.string().min(10, 'Invalid invitation token'),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol'),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

export const roleBasedLoginSchema = z.object({
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
  schoolId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type RegisterWithTokenInput = z.infer<typeof registerWithTokenSchema>;
export type RoleBasedLoginInput = z.infer<typeof roleBasedLoginSchema>;
