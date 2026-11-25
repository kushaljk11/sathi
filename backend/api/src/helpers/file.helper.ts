import multer from 'multer';
import { AppError } from '../core/errors/app.error';
import { MAX_UPLOAD_BYTES } from '../constants/app.constants';
import { storage } from '../integrations/storage/storage.service';

/** Validates by magic bytes (not the client-supplied MIME type). Only PDF/PNG/JPEG are accepted. */
export function sniff(buf: Buffer): { ext: 'pdf' | 'png' | 'jpg'; mime: string } | null {
  if (buf.subarray(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  return null;
}

export function assertSafePdf(buf: Buffer) {
  // Reject PDFs with active content. Full AV scanning (e.g. ClamAV) is a documented production step.
  const s = buf.toString('latin1');
  if (/\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile/.test(s)) throw new AppError(400, 'PDF contains active content and was rejected');
}

/** Multer middleware: single in-memory file, size-limited. Always pass the result through `saveVerifiedFile`. */
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

export async function saveVerifiedFile(file: Express.Multer.File | undefined) {
  if (!file) throw new AppError(400, 'File required');
  const kind = sniff(file.buffer);
  if (!kind) throw new AppError(400, 'Only PDF, PNG or JPEG files are accepted');
  if (kind.ext === 'pdf') assertSafePdf(file.buffer);
  const key = await storage.put(file.buffer, kind.ext);
  return { key, mime: kind.mime, name: file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 120) };
}
