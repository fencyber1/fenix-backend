import { Router, type Request, type Response } from 'express';
import express from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { BadRequestError, NotFoundError } from '@/utils/errors';
import { asLocalStorage, getStorage } from '@/adapters/storage';

/**
 * Local storage driver routes. Only mounted when STORAGE_DRIVER=local. They
 * back the presigned-upload contract used by the frontend in development, and
 * serve the uploaded files. In production (STORAGE_DRIVER=s3) these are not
 * mounted — uploads/reads go directly to object storage.
 */
const router = Router();

// Raw body for the upload PUT (binary). Limit guards memory.
router.put(
  '/upload/:token',
  express.raw({ type: () => true, limit: '15mb' }),
  asyncHandler(async (req: Request, res: Response) => {
    const local = asLocalStorage(getStorage());
    if (!local) throw new NotFoundError('Upload endpoint');
    const token = req.params.token as string;

    let verified: { key: string; contentType: string; maxBytes: number };
    try {
      verified = local.verifyUploadToken(token);
    } catch {
      throw new BadRequestError('Invalid or expired upload token');
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestError('Empty upload body');
    if (body.length > verified.maxBytes) throw new BadRequestError('File exceeds the presigned size limit');

    await local.writeFile(verified.key, body);
    res.status(200).json({ success: true, message: 'Uploaded', data: { key: verified.key } });
  }),
);

// Serve files.
router.get(
  '/*',
  asyncHandler(async (req: Request, res: Response) => {
    const local = asLocalStorage(getStorage());
    if (!local) throw new NotFoundError('File');
    const key = req.params[0] as string;
    try {
      const buffer = await local.readFile(key);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch {
      throw new NotFoundError('File');
    }
  }),
);

export default router;
