import { z } from 'zod';

export const documentTypeEnum = z.enum([
  'PHOTO',
  'BIRTH_CERTIFICATE',
  'REPORT_CARD',
  'MEDICAL',
  'ID_CARD',
  'OTHER',
]);

export const presignSchema = z.object({
  studentId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  type: documentTypeEnum.default('OTHER'),
});

export const confirmDocumentSchema = z.object({
  studentId: z.string().uuid(),
  key: z.string().trim().min(1).max(400),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  type: documentTypeEnum.default('OTHER'),
});

export const listDocumentsQuerySchema = z.object({
  studentId: z.string().uuid(),
});

export const documentIdParamSchema = z.object({ id: z.string().uuid() });

export type PresignInput = z.infer<typeof presignSchema>;
export type ConfirmDocumentInput = z.infer<typeof confirmDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
