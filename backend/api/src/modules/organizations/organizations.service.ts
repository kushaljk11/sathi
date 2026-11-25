import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import { saveVerifiedFile } from '../../helpers/file.helper';
import { orgOf } from '../../helpers/identity.helper';
import { cancelProgramBooking } from '../programs/programs.service';
import type { AddStaffInput, AttendanceInput, BookingStatusInput, OrganizationProfileInput, ProgramInput, ServiceInput, UploadedFile } from './organizations.types';

/** Editing published content requires re-approval (only if the org is itself verified); rejected content goes back to draft. */
function statusAfterEdit<S extends string>(current: S, orgApproved: boolean) {
  if (current === 'PUBLISHED') return orgApproved ? 'PENDING_APPROVAL' : 'DRAFT';
  if (current === 'REJECTED') return 'DRAFT';
  return current;
}

// =============== PROFILE, DOCUMENTS, STAFF ===============
export async function getOrganization(userId: string) {
  const o = await orgOf(userId);
  return prisma.organization.findUniqueOrThrow({
    where: { id: o.id },
    include: { documents: { select: { id: true, fileName: true, uploadedAt: true } }, staff: { include: { user: { select: { id: true, displayName: true, email: true } } } } },
  });
}

export async function updateOrganization(userId: string, input: OrganizationProfileInput) {
  const o = await orgOf(userId);
  return prisma.organization.update({ where: { id: o.id }, data: input });
}

export async function addOrganizationDocument(userId: string, file: UploadedFile) {
  const o = await orgOf(userId);
  const f = await saveVerifiedFile(file);
  const doc = await prisma.verificationDocument.create({ data: { organizationId: o.id, fileName: f.name, storageKey: f.key, mimeType: f.mime } });
  return { id: doc.id, fileName: doc.fileName };
}

export async function submitOrganizationVerification(userId: string) {
  const o = await orgOf(userId);
  if (!(await prisma.verificationDocument.count({ where: { organizationId: o.id } }))) throw new AppError(400, 'Upload at least one registration document');
  await prisma.organization.update({ where: { id: o.id }, data: { verificationStatus: 'PENDING', rejectionReason: null } });
  return { status: 'PENDING' as const };
}

/** Staff management: owners add existing organization-role accounts by email. */
export async function addStaff(userId: string, { email }: AddStaffInput) {
  const o = await orgOf(userId);
  if (!o.isOwner) throw new AppError(403, 'Only the owner can manage staff');
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!u || u.role !== 'ORGANIZATION') throw new AppError(400, 'That person must first register an organization account');
  if (await prisma.organizationStaff.findFirst({ where: { userId: u.id } })) throw new AppError(409, 'User already belongs to an organization');
  return prisma.organizationStaff.create({ data: { organizationId: o.id, userId: u.id } });
}

export async function removeStaff(userId: string, staffUserId: string) {
  const o = await orgOf(userId);
  if (!o.isOwner || staffUserId === userId) throw new AppError(403, 'Not allowed');
  await prisma.organizationStaff.deleteMany({ where: { organizationId: o.id, userId: staffUserId } });
  return { removed: true };
}

// =============== PROGRAMS ===============
export async function listPrograms(userId: string) {
  const o = await orgOf(userId);
  return prisma.program.findMany({
    where: { organizationId: o.id },
    orderBy: { startsAt: 'desc' },
    include: { _count: { select: { waitlist: true, bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED', 'COMPLETED'] } } } } } },
  });
}

export async function createProgram(userId: string, input: ProgramInput) {
  const o = await orgOf(userId);
  return prisma.program.create({ data: { ...input, organizationId: o.id } });
}

export async function updateProgram(userId: string, programId: string, input: ProgramInput) {
  const o = await orgOf(userId);
  const p = await prisma.program.findFirst({ where: { id: programId, organizationId: o.id } });
  if (!p) throw notFound('Program');
  if (input.seats < p.seatsTaken) throw new AppError(400, `Seats cannot be below current bookings (${p.seatsTaken})`);
  return prisma.program.update({ where: { id: p.id }, data: { ...input, status: statusAfterEdit(p.status, o.verificationStatus === 'APPROVED') } });
}

export async function submitProgram(userId: string, programId: string) {
  const o = await orgOf(userId);
  if (o.verificationStatus !== 'APPROVED') throw new AppError(403, 'Your organization must be verified before publishing');
  const u = await prisma.program.updateMany({
    where: { id: programId, organizationId: o.id, status: { in: ['DRAFT', 'REJECTED'] } },
    data: { status: 'PENDING_APPROVAL', rejectionReason: null },
  });
  if (!u.count) throw new AppError(409, 'Only draft or rejected programs can be submitted');
  return { status: 'PENDING_APPROVAL' as const };
}

export async function archiveProgram(userId: string, programId: string) {
  const o = await orgOf(userId);
  await prisma.program.updateMany({ where: { id: programId, organizationId: o.id }, data: { status: 'ARCHIVED' } });
  return { status: 'ARCHIVED' as const };
}

/** Organization sees only booking-management data. Never who recommended, never assessments/check-ins. */
export async function listProgramBookings(userId: string, programId: string) {
  const o = await orgOf(userId);
  const p = await prisma.program.findFirst({ where: { id: programId, organizationId: o.id } });
  if (!p) throw notFound('Program');
  const bookings = await prisma.programBooking.findMany({
    where: { programId: p.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      youth: { select: { ageGroup: true, user: { select: { displayName: true } } } },
      attendance: true,
      feedback: { select: { rating: true, comment: true } },
    },
  });
  const waitlist = await prisma.waitlistEntry.findMany({ where: { programId: p.id }, orderBy: { position: 'asc' }, select: { id: true, position: true, createdAt: true } });
  return { program: p, bookings, waitlist };
}

export async function recordAttendance(userId: string, bookingId: string, input: AttendanceInput) {
  const o = await orgOf(userId);
  const bk = await prisma.programBooking.findFirst({ where: { id: bookingId, program: { organizationId: o.id } } });
  if (!bk || !['CONFIRMED', 'ATTENDED'].includes(bk.status)) throw notFound('Booking');
  await prisma.attendance.create({ data: { bookingId: bk.id, ...input } });
  if (input.present && bk.status === 'CONFIRMED') await prisma.programBooking.update({ where: { id: bk.id }, data: { status: 'ATTENDED' } });
  return { recorded: true };
}

export async function updateBookingStatus(userId: string, bookingId: string, { status }: BookingStatusInput) {
  const o = await orgOf(userId);
  if (status === 'CANCELLED') return cancelProgramBooking(bookingId, { userId, asOrg: o.id });
  const u = await prisma.programBooking.updateMany({ where: { id: bookingId, program: { organizationId: o.id }, status: { in: ['CONFIRMED', 'ATTENDED'] } }, data: { status } });
  if (!u.count) throw new AppError(409, 'Booking cannot be updated');
  return { status };
}

// =============== SERVICES ===============
export async function listServices(userId: string) {
  const o = await orgOf(userId);
  return prisma.service.findMany({ where: { organizationId: o.id }, orderBy: { title: 'asc' } });
}

export async function createService(userId: string, input: ServiceInput) {
  const o = await orgOf(userId);
  return prisma.service.create({ data: { ...input, organizationId: o.id } });
}

export async function updateService(userId: string, serviceId: string, input: ServiceInput) {
  const o = await orgOf(userId);
  const s = await prisma.service.findFirst({ where: { id: serviceId, organizationId: o.id } });
  if (!s) throw notFound('Service');
  return prisma.service.update({ where: { id: s.id }, data: { ...input, status: statusAfterEdit(s.status, o.verificationStatus === 'APPROVED') } });
}

export async function submitService(userId: string, serviceId: string) {
  const o = await orgOf(userId);
  if (o.verificationStatus !== 'APPROVED') throw new AppError(403, 'Your organization must be verified before publishing');
  const u = await prisma.service.updateMany({ where: { id: serviceId, organizationId: o.id, status: { in: ['DRAFT', 'REJECTED'] } }, data: { status: 'PENDING_APPROVAL' } });
  if (!u.count) throw new AppError(409, 'Only draft or rejected services can be submitted');
  return { status: 'PENDING_APPROVAL' as const };
}

export async function archiveService(userId: string, serviceId: string) {
  const o = await orgOf(userId);
  await prisma.service.updateMany({ where: { id: serviceId, organizationId: o.id }, data: { status: 'ARCHIVED' } });
  return { status: 'ARCHIVED' as const };
}
