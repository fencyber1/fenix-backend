import crypto from 'node:crypto';
import { AuditAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { getStorage } from '@/adapters/storage';
import { assertCanAccessStudent } from '@/modules/shared/scope';
import type { AuthContext } from '@/types/express';
import type { ConfirmDocumentInput, ListDocumentsQuery, PresignInput } from './documents.schemas';

function validateUpload(mimeType: string, sizeBytes: number): void {
  if (!env.UPLOAD_ALLOWED_MIME.includes(mimeType)) {
    throw new BadRequestError('File type is not allowed', [{ field: 'mimeType', message: `Allowed: ${env.UPLOAD_ALLOWED_MIME.join(', ')}` }]);
  }
  if (sizeBytes > env.UPLOAD_MAX_BYTES) {
    throw new BadRequestError('File exceeds maximum allowed size', [{ field: 'sizeBytes', message: `Max ${env.UPLOAD_MAX_BYTES} bytes` }]);
  }
}

function buildKey(studentId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-100);
  return `students/${studentId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safe}`;
}

export async function presignUpload(auth: AuthContext, input: PresignInput): Promise<unknown> {
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN' && auth.role !== 'TEACHER') {
    throw new ForbiddenError('You cannot upload documents');
  }
  await assertCanAccessStudent(auth, input.studentId);
  validateUpload(input.mimeType, input.sizeBytes);
  const key = buildKey(input.studentId, input.fileName);
  const presigned = await getStorage().presignUpload({ key, contentType: input.mimeType, maxBytes: input.sizeBytes });
  return presigned;
}

export async function confirmUpload(auth: AuthContext, input: ConfirmDocumentInput, ctx: AuditContext): Promise<unknown> {
  await assertCanAccessStudent(auth, input.studentId);
  validateUpload(input.mimeType, input.sizeBytes);
  const fileUrl = getStorage().getPublicUrl(input.key);
  const doc = await prisma.document.create({
    data: {
      tenantId: auth.tenantId!,
      studentId: input.studentId,
      name: input.name,
      type: input.type,
      fileUrl,
      fileKey: input.key,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: auth.userId,
    },
  });
  await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'documents', recordId: doc.id, after: doc });
  return doc;
}

export async function listDocuments(auth: AuthContext, query: ListDocumentsQuery): Promise<unknown[]> {
  await assertCanAccessStudent(auth, query.studentId);
  return prisma.document.findMany({
    where: { studentId: query.studentId, deletedAt: null },
    orderBy: { uploadedAt: 'desc' },
  });
}

export async function deleteDocument(auth: AuthContext, id: string, ctx: AuditContext): Promise<void> {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) throw new NotFoundError('Document');
  await assertCanAccessStudent(auth, doc.studentId);
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') throw new ForbiddenError('Only administrators can delete documents');
  const after = await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ ...ctx, action: AuditAction.DELETE, tableName: 'documents', recordId: id, before: doc, after });
}
