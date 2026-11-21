import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { asyncH, ok, prisma, validate, youthOf, counselorOf, orgOf, audit, HttpError, notFound } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';
import { upload, saveVerifiedFile, storage } from '../../lib/storage';

const r = Router();
r.use(authenticate);

const mode = z.enum(['ONLINE', 'IN_PERSON', 'BOTH']);
const strArr = z.array(z.string().min(1).max(60)).max(20);

// ---------- common account ----------
r.patch('/me', asyncH(async (req, res) => {
  const b = validate(z.object({ displayName: z.string().min(2).max(80).optional(), timezone: z.string().max(60).optional() }), req.body);
  const u = await prisma.user.update({ where: { id: req.user!.id }, data: b, select: { id: true, displayName: true, timezone: true } });
  ok(res, u);
}));

r.get('/me/notification-preferences', asyncH(async (req, res) =>
  ok(res, await prisma.notificationPreference.upsert({ where: { userId: req.user!.id }, update: {}, create: { userId: req.user!.id } }))));

r.put('/me/notification-preferences', asyncH(async (req, res) => {
  const min = z.number().int().min(0).max(1439).nullable();
  const b = validate(z.object({ email: z.boolean(), push: z.boolean(), quietStartMin: min, quietEndMin: min, fcmToken: z.string().max(4096).nullable().optional() }), req.body);
  ok(res, await prisma.notificationPreference.upsert({ where: { userId: req.user!.id }, update: b, create: { userId: req.user!.id, ...b } }));
}));

/** Data export (privacy right). Excludes counselor private notes, which are professional records. */
r.get('/me/export', asyncH(async (req, res) => {
  const id = req.user!.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, role: true, displayName: true, createdAt: true, timezone: true } });
  const youth = await prisma.youthProfile.findUnique({
    where: { userId: id },
    include: { checkIns: true, assessments: { include: { responses: true } }, needProfiles: true, safetyScreenings: true, consents: { include: { history: true } }, appointments: true, programBookings: true },
  });
  const notifications = await prisma.notification.findMany({ where: { userId: id } });
  const posts = await prisma.communityPost.findMany({ where: { authorId: id } });
  const comments = await prisma.communityComment.findMany({ where: { authorId: id } });
  await audit(id, 'DATA_EXPORT', 'User', id);
  res.setHeader('Content-Disposition', 'attachment; filename="sathi-export.json"');
  ok(res, { exportedAt: new Date(), user, youth, notifications, posts, comments });
}));

/** Account deletion: anonymise identity, revoke sessions. Records needed for payments/safety follow the retention policy. */
r.post('/me/delete', asyncH(async (req, res) => {
  const { password } = validate(z.object({ password: z.string() }), req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await argon2.verify(u.passwordHash, password))) throw new HttpError(400, 'Password is incorrect');
  if (u.role === 'ADMIN') throw new HttpError(400, 'Admin accounts must be removed by another administrator');
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { status: 'DELETED', deletedAt: new Date(), email: `deleted+${u.id}@sathi.invalid`, displayName: 'Deleted user', passwordHash: 'x' } }),
    prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.communityPost.updateMany({ where: { authorId: u.id }, data: { pseudonym: 'Deleted user' } }),
    prisma.communityComment.updateMany({ where: { authorId: u.id }, data: { pseudonym: 'Deleted user' } }),
    prisma.googleCredential.deleteMany({ where: { userId: u.id } }),
  ]);
  // Close open commitments so counterparts are not left waiting.
  const y = await prisma.youthProfile.findUnique({ where: { userId: u.id } });
  if (y) {
    const appts = await prisma.appointment.findMany({ where: { youthId: y.id, status: { in: ['PENDING_PAYMENT', 'PENDING_COUNSELOR', 'CONFIRMED'] }, startsAt: { gt: new Date() } } });
    for (const a of appts) await prisma.$transaction([prisma.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED', cancelReason: 'Account deleted' } }), prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } })]);
    await prisma.supportRelationship.updateMany({ where: { youthId: y.id, status: { in: ['ACTIVE', 'PAUSED'] } }, data: { status: 'CLOSED', endedAt: new Date() } });
    await prisma.waitlistEntry.deleteMany({ where: { youthId: y.id } });
    const { cancelProgramBooking } = await import('../programs/programs.service');
    for (const b of await prisma.programBooking.findMany({ where: { youthId: y.id, status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } } })) await cancelProgramBooking(b.id, { userId: u.id }).catch(() => null);
  }
  await audit(u.id, 'ACCOUNT_DELETED', 'User', u.id);
  res.clearCookie('sathi_rt', { path: '/api/v1/auth' });
  ok(res, { deleted: true });
}));

// ---------- youth ----------
const youthSchema = z.object({
  ageGroup: z.enum(['13-14', '15-17', '18-24', '25-29']).nullable().optional(),
  locationArea: z.string().max(100).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  maxTravelKm: z.number().int().min(0).max(500).nullable().optional(),
  preferredLanguages: strArr.optional(),
  preferredMode: mode.optional(),
  accessibility: strArr.optional(),
  checkInFrequencyDays: z.number().int().min(1).max(30).optional(),
});
r.get('/youth/me', requireRole('YOUTH'), asyncH(async (req, res) => ok(res, await youthOf(req.user!.id))));
r.put('/youth/me', requireRole('YOUTH'), asyncH(async (req, res) =>
  ok(res, await prisma.youthProfile.update({ where: { userId: req.user!.id }, data: validate(youthSchema, req.body) }))));

// ---------- counselor ----------
const counselorSchema = z.object({
  qualifications: z.string().min(2).max(500),
  experienceYears: z.number().int().min(0).max(60),
  bio: z.string().max(2000).nullable().optional(),
  specializations: strArr, supportedConcerns: strArr, languages: strArr, ageGroups: strArr,
  locationArea: z.string().max(100).nullable().optional(),
  latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional(),
  mode, sessionFeePaisa: z.number().int().min(0).max(10_000_000), acceptingBookings: z.boolean(),
});
r.get('/counselor/me', requireRole('COUNSELOR'), asyncH(async (req, res) =>
  ok(res, await prisma.counselorProfile.findUniqueOrThrow({ where: { userId: req.user!.id }, include: { documents: { select: { id: true, fileName: true, uploadedAt: true, mimeType: true } } } }))));
r.put('/counselor/me', requireRole('COUNSELOR'), asyncH(async (req, res) =>
  ok(res, await prisma.counselorProfile.update({ where: { userId: req.user!.id }, data: validate(counselorSchema, req.body) }))));

r.post('/counselor/me/documents', requireRole('COUNSELOR'), upload.single('file'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  const f = await saveVerifiedFile(req.file);
  const doc = await prisma.verificationDocument.create({ data: { counselorId: c.id, fileName: f.name, storageKey: f.key, mimeType: f.mime } });
  ok(res, { id: doc.id, fileName: doc.fileName }, 201);
}));
r.post('/counselor/me/submit-verification', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await prisma.counselorProfile.findUniqueOrThrow({ where: { userId: req.user!.id }, include: { _count: { select: { documents: true } } } });
  if (!c.qualifications || !c.supportedConcerns.length || !c.languages.length) throw new HttpError(400, 'Complete your profile first');
  if (!c._count.documents) throw new HttpError(400, 'Upload at least one credential document');
  if (c.verificationStatus === 'APPROVED') throw new HttpError(400, 'Already verified');
  await prisma.counselorProfile.update({ where: { id: c.id }, data: { verificationStatus: 'PENDING', rejectionReason: null } });
  await audit(req.user!.id, 'VERIFICATION_SUBMITTED', 'CounselorProfile', c.id);
  ok(res, { status: 'PENDING' });
}));

// ---------- organization ----------
const orgSchema = z.object({
  name: z.string().min(2).max(120), description: z.string().max(3000).nullable().optional(),
  contactEmail: z.string().email(), contactPhone: z.string().max(30).nullable().optional(),
  locationArea: z.string().max(100).nullable().optional(), latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional(),
  languages: strArr, operatingHours: z.string().max(200).nullable().optional(),
});
r.get('/organization/me', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await orgOf(req.user!.id);
  ok(res, await prisma.organization.findUniqueOrThrow({
    where: { id: o.id },
    include: { documents: { select: { id: true, fileName: true, uploadedAt: true } }, staff: { include: { user: { select: { id: true, displayName: true, email: true } } } } },
  }));
}));
r.put('/organization/me', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await orgOf(req.user!.id);
  ok(res, await prisma.organization.update({ where: { id: o.id }, data: validate(orgSchema, req.body) }));
}));
r.post('/organization/me/documents', requireRole('ORGANIZATION'), upload.single('file'), asyncH(async (req, res) => {
  const o = await orgOf(req.user!.id);
  const f = await saveVerifiedFile(req.file);
  const doc = await prisma.verificationDocument.create({ data: { organizationId: o.id, fileName: f.name, storageKey: f.key, mimeType: f.mime } });
  ok(res, { id: doc.id, fileName: doc.fileName }, 201);
}));
r.post('/organization/me/submit-verification', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await orgOf(req.user!.id);
  if (!(await prisma.verificationDocument.count({ where: { organizationId: o.id } }))) throw new HttpError(400, 'Upload at least one registration document');
  await prisma.organization.update({ where: { id: o.id }, data: { verificationStatus: 'PENDING', rejectionReason: null } });
  ok(res, { status: 'PENDING' });
}));
/** Staff management: owners add existing organization-role accounts by email. */
r.post('/organization/me/staff', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await orgOf(req.user!.id);
  if (!o.isOwner) throw new HttpError(403, 'Only the owner can manage staff');
  const { email } = validate(z.object({ email: z.string().email() }), req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!u || u.role !== 'ORGANIZATION') throw new HttpError(400, 'That person must first register an organization account');
  if (await prisma.organizationStaff.findFirst({ where: { userId: u.id } })) throw new HttpError(409, 'User already belongs to an organization');
  ok(res, await prisma.organizationStaff.create({ data: { organizationId: o.id, userId: u.id } }), 201);
}));
r.delete('/organization/me/staff/:userId', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await orgOf(req.user!.id);
  if (!o.isOwner || req.params.userId === req.user!.id) throw new HttpError(403, 'Not allowed');
  await prisma.organizationStaff.deleteMany({ where: { organizationId: o.id, userId: String(req.params.userId) } });
  ok(res, { removed: true });
}));

/** Document download: owner or admin only. */
r.get('/documents/:id', asyncH(async (req, res) => {
  const d = await prisma.verificationDocument.findUnique({ where: { id: String(req.params.id) }, include: { counselor: true } });
  if (!d) throw notFound('Document');
  const isAdmin = req.user!.role === 'ADMIN';
  const ownsCounselor = d.counselor?.userId === req.user!.id;
  const ownsOrg = d.organizationId && (await prisma.organizationStaff.findFirst({ where: { organizationId: d.organizationId, userId: req.user!.id } }));
  if (!isAdmin && !ownsCounselor && !ownsOrg) throw new HttpError(403, 'Forbidden');
  if (isAdmin) await audit(req.user!.id, 'DOCUMENT_VIEWED', 'VerificationDocument', d.id);
  res.setHeader('Content-Type', d.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${d.fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(await storage.get(d.storageKey));
}));

export default r;
