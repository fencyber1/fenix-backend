import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { LocalStorageAdapter } from '@/adapters/storage';
import { resetDb } from '../helpers/db';
import { createSchool, createStudentRow, createUser } from '../helpers/factories';
import { agentFor, authHeader } from '../helpers/request';

let app: Application;
beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('LocalStorageAdapter', () => {
  it('signs and verifies an upload token', async () => {
    const adapter = new LocalStorageAdapter();
    const token = adapter.createUploadToken('students/abc/file.pdf', 'application/pdf', 1000);
    const verified = adapter.verifyUploadToken(token);
    expect(verified.key).toBe('students/abc/file.pdf');
    expect(verified.contentType).toBe('application/pdf');
    expect(verified.maxBytes).toBe(1000);
  });

  it('rejects a tampered token', () => {
    const adapter = new LocalStorageAdapter();
    expect(() => adapter.verifyUploadToken('garbage.token')).toThrow();
  });

  it('produces a public url from a key', () => {
    const adapter = new LocalStorageAdapter();
    expect(adapter.getPublicUrl('a/b.png')).toContain('/a/b.png');
  });

  it('round-trips a presigned upload end-to-end through the HTTP route', async () => {
    const school = await createSchool();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
    const student = await createStudentRow({ schoolId: school.id });
    const headers = authHeader(admin);

    const presign = await agentFor(app)
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({ studentId: student.id, fileName: 'note.png', mimeType: 'image/png', sizeBytes: 8, type: 'PHOTO' });
    expect(presign.status).toBe(200);

    // Extract the local upload path and PUT real bytes to it.
    const uploadUrl = presign.body.data.uploadUrl as string;
    const path = uploadUrl.replace(/^https?:\/\/[^/]+/, '');
    const put = await agentFor(app)
      .put(path)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('PNGBYTES'));
    expect(put.status).toBe(200);

    // The stored file is now readable via the public files route.
    const get = await agentFor(app).get(`/files/${presign.body.data.key}`);
    expect(get.status).toBe(200);
  });
});
