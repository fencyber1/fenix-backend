import { z } from 'zod';

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT']),
  // For PARENT/STUDENT linkage
  studentId: z.string().uuid().optional(),
  relationship: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(30).optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
