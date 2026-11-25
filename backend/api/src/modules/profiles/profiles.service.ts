import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { saveVerifiedFile } from '../../helpers/file.helper';
import { counselorOf, youthOf } from '../../helpers/identity.helper';
import { storage } from '../../integrations/storage/storage.service';
import type { AuthUser } from '../../types/common.types';
import type { CounselorProfileInput, UploadedFile, YouthProfileInput } from './profiles.types';

// ---------- youth ----------
export const getYouthProfile = (userId: string) => youthOf(userId);

export const updateYouthProfile = (userId: string, input: YouthProfileInput) => prisma.youthProfile.update({ where: { userId }, data: input });

// ---------- counselor ----------
export const getCounselorProfile = (userId: string) =>
  prisma.counselorProfile.findUniqueOrThrow({
    where: { userId },
    include: { documents: { select: { id: true, fileName: true, uploadedAt: true, mimeType: true } } },
  });

export const updateCounselorProfile = (userId: string, input: CounselorProfileInput) => prisma.counselorProfile.update({ where: { userId }, data: input });

export async function addCounselorDocument(userId: string, file: UploadedFile) {
  const c = await counselorOf(userId);
  const f = await saveVerifiedFile(file);
  const doc = await prisma.verificationDocument.create({ data: { counselorId: c.id, fileName: f.name, storageKey: f.key, mimeType: f.mime } });
  return { id: doc.id, fileName: doc.fileName };
}

export async function submitCounselorVerification(userId: string) {
  const c = await prisma.counselorProfile.findUniqueOrThrow({ where: { userId }, include: { _count: { select: { documents: true } } } });
  if (!c.qualifications || !c.supportedConcerns.length || !c.languages.length) throw new AppError(400, 'Complete your profile first');
  if (!c._count.documents) throw new AppError(400, 'Upload at least one credential document');
  if (c.verificationStatus === 'APPROVED') throw new AppError(400, 'Already verified');
  await prisma.counselorProfile.update({ where: { id: c.id }, data: { verificationStatus: 'PENDING', rejectionReason: null } });
  await audit(userId, 'VERIFICATION_SUBMITTED', 'CounselorProfile', c.id);
  return { status: 'PENDING' as const };
}

// ---------- documents ----------
/** Document download: owner or admin only. */
export async function getDocumentFile(user: AuthUser, id: string) {
  const d = await prisma.verificationDocument.findUnique({ where: { id }, include: { counselor: true } });
  if (!d) throw notFound('Document');
  const isAdmin = user.role === 'ADMIN';
  const ownsCounselor = d.counselor?.userId === user.id;
  const ownsOrg = d.organizationId && (await prisma.organizationStaff.findFirst({ where: { organizationId: d.organizationId, userId: user.id } }));
  if (!isAdmin && !ownsCounselor && !ownsOrg) throw new AppError(403, 'Forbidden');
  if (isAdmin) await audit(user.id, 'DOCUMENT_VIEWED', 'VerificationDocument', d.id);
  return { fileName: d.fileName, mimeType: d.mimeType, content: await storage.get(d.storageKey) };
}
