/* Extra synthetic demo data so every role's dashboard and queue has realistic content. Idempotent. */
import { createHash, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { PrismaClient, Role } from '@prisma/client';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const day = 864e5;

export async function seedDemo(prisma: PrismaClient, password: string) {
  if (await prisma.user.findUnique({ where: { email: 'youth3@sathi.dev' } })) return; // already applied
  const pw = await argon2.hash(password, { type: argon2.argon2id });
  const mk = (email: string, role: Role, displayName: string) =>
    prisma.user.create({ data: { email, role, displayName, passwordHash: pw, emailVerifiedAt: new Date(), notificationPref: { create: {} } } });
  const get = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, include: { youthProfile: true, counselorProfile: true } });

  // ---- more youth with check-in history and need profiles ----
  const youthNames = ['Anisha M.', 'Sujan K.', 'Rita B.', 'Kiran D.'];
  for (const [i, name] of youthNames.entries()) {
    const u = await mk(`youth${i + 3}@sathi.dev`, 'YOUTH', name);
    const y = await prisma.youthProfile.create({
      data: { userId: u.id, ageGroup: i % 2 ? '15-17' : '18-24', locationArea: ['Lalitpur', 'Pokhara', 'Bhaktapur', 'Kathmandu'][i], preferredLanguages: ['ne', 'en'], preferredMode: i % 2 ? 'IN_PERSON' : 'ONLINE', accessibility: [] },
    });
    for (let d = 21; d >= 0; d -= 2 + (i % 2))
      await prisma.wellbeingCheckIn.create({ data: { youthId: y.id, createdAt: new Date(Date.now() - d * day), mood: 2 + ((d + i) % 3), stress: 3 + ((d * (i + 1)) % 6), sleep: 2 + (d % 3), energy: 2 + ((d + 1) % 3), social: 3, functioning: 3, concerns: [['stress'], ['academic'], ['family'], ['sleep']][i] } });
    await prisma.supportNeedProfile.create({
      data: { youthId: y.id, concerns: [['anxiety', 'academic'], ['family', 'stress'], ['low-mood'], ['substance-use', 'stress']][i], impactLevel: 2 + (i % 3), durationBucket: '1-3 months', desiredSupport: ['counseling'], languages: ['ne', 'en'], mode: i % 2 ? 'IN_PERSON' : 'ONLINE', locationArea: 'Kathmandu', availability: [{ day: 2, startMin: 600, endMin: 900 }, { day: 4, startMin: 780, endMin: 1020 }], accessibility: [] },
    });
    await prisma.progressMilestone.create({ data: { youthUserId: u.id, kind: 'ASSESSMENT_COMPLETED' } });
  }

  // ---- verification queue: pending counselor + pending organization ----
  const pc = await mk('counselor4@sathi.dev', 'COUNSELOR', 'Maya Shrestha');
  await prisma.counselorProfile.create({ data: { userId: pc.id, qualifications: 'MPhil Clinical Psychology (synthetic)', experienceYears: 3, bio: 'Awaiting verification (synthetic).', specializations: ['anxiety', 'sleep'], supportedConcerns: ['anxiety', 'sleep'], languages: ['ne', 'en'], ageGroups: ['18-24'], mode: 'ONLINE', sessionFeePaisa: 100000, verificationStatus: 'PENDING' } });
  const po = await mk('org3@sathi.dev', 'ORGANIZATION', 'New Horizons Youth Network');
  await prisma.organization.create({ data: { name: 'New Horizons Youth Network', contactEmail: po.email, description: 'Awaiting verification (synthetic).', locationArea: 'Biratnagar', languages: ['ne'], verificationStatus: 'PENDING', staff: { create: { userId: po.id, isOwner: true } } } });

  // ---- appointments in different states ----
  const y1 = await get('youth1@sathi.dev'), y2 = await get('youth2@sathi.dev'), y3 = await get('youth3@sathi.dev');
  const c1 = await get('counselor1@sathi.dev'), c3 = await get('counselor3@sathi.dev');
  const freeSlot = async (counselorId: string, minDays: number) =>
    prisma.appointmentSlot.findFirstOrThrow({ where: { counselorId, isBooked: false, startsAt: { gte: new Date(Date.now() + minDays * day) } }, orderBy: { startsAt: 'asc' } });
  const book = async (youthId: string, counselorId: string, minDays: number, status: 'CONFIRMED' | 'PENDING_COUNSELOR', mode: 'ONLINE' | 'IN_PERSON', relationshipId?: string, fee = 0) => {
    const s = await freeSlot(counselorId, minDays);
    await prisma.appointmentSlot.update({ where: { id: s.id }, data: { isBooked: true } });
    return prisma.appointment.create({ data: { youthId, counselorId, slotId: s.id, status, mode, feePaisa: fee, startsAt: s.startsAt, endsAt: s.endsAt, relationshipId } });
  };
  const rel1 = await prisma.supportRelationship.findFirstOrThrow({ where: { youthId: y1.youthProfile!.id, counselorId: c1.counselorProfile!.id } });
  await book(y1.youthProfile!.id, c1.counselorProfile!.id, 2, 'CONFIRMED', 'IN_PERSON', rel1.id);
  // Paid booking request waiting for counselor1 (with a verified sandbox-style payment record)
  const req = await book(y2.youthProfile!.id, c1.counselorProfile!.id, 3, 'PENDING_COUNSELOR', 'ONLINE', undefined, 150000);
  const pay = await prisma.payment.create({ data: { appointmentId: req.id, provider: 'ESEWA', reference: randomUUID(), transactionId: 'DEMO-ESEWA-0001', amountPaisa: 150000, status: 'SUCCESS', payerUserId: y2.id, verifiedAt: new Date() } });
  // Confirmed online session with counselor3 whose Google account is not connected → meeting needs setup
  const rel3 = await prisma.supportRelationship.create({ data: { youthId: y3.youthProfile!.id, counselorId: c3.counselorProfile!.id, conversation: { create: {} } } });
  const online = await book(y3.youthProfile!.id, c3.counselorProfile!.id, 1, 'CONFIRMED', 'ONLINE', rel3.id);
  await prisma.meeting.create({ data: { appointmentId: online.id, provider: 'MANUAL_DEV', organizerUserId: c3.id, startTime: online.startsAt, endTime: online.endsAt, status: 'FAILED', creationStatus: 'GOOGLE_NOT_CONFIGURED' } });
  await prisma.timelineEvent.create({ data: { relationshipId: rel3.id, type: 'RELATIONSHIP', title: 'Support relationship started' } });
  await prisma.consentRecord.create({ data: { youthId: y3.youthProfile!.id, recipientId: c3.counselorProfile!.id, recipientType: 'COUNSELOR', category: 'SUPPORT_NEED_PROFILE', purpose: 'Support relationship', granted: true, history: { create: { granted: true } } } });
  // A proposed plan awaiting youth3's agreement
  await prisma.supportPlan.create({ data: { relationshipId: rel3.id, status: 'PROPOSED', versions: { create: { version: 1, title: 'Building a steady study routine', description: 'Small daily steps to reduce exam pressure. (Synthetic)', startDate: new Date(), reviewDate: new Date(Date.now() + 21 * day) } } } });
  // Refund request for admin (a past cancelled paid session)
  const cancelled = await book(y2.youthProfile!.id, c3.counselorProfile!.id, 5, 'CONFIRMED', 'ONLINE', undefined, 120000);
  await prisma.appointment.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED', cancelReason: 'Schedule conflict (synthetic)' } });
  await prisma.appointmentSlot.update({ where: { id: cancelled.slotId }, data: { isBooked: false } });
  const p2 = await prisma.payment.create({ data: { appointmentId: cancelled.id, provider: 'ESEWA', reference: randomUUID(), transactionId: 'DEMO-ESEWA-0002', amountPaisa: 120000, status: 'SUCCESS', payerUserId: y2.id, verifiedAt: new Date() } });
  await prisma.refund.create({ data: { paymentId: p2.id, amountPaisa: 120000, reason: 'Cancelled by youth', requestedBy: y2.id } });

  // ---- programs: bookings, waitlist, pending approval, recommendation ----
  const org1 = await prisma.organizationStaff.findFirstOrThrow({ where: { user: { email: 'org1@sathi.dev' } } });
  const workshop = await prisma.program.findFirstOrThrow({ where: { organizationId: org1.organizationId } });
  const small = await prisma.program.create({ data: { organizationId: org1.organizationId, title: 'Mindful Mornings (small group)', description: 'Five-session group on calm routines. (Synthetic)', category: 'wellbeing', startsAt: new Date(Date.now() + 6 * day), endsAt: new Date(Date.now() + 6 * day + 2 * 36e5), seats: 2, seatsTaken: 2, mode: 'IN_PERSON', locationArea: 'Kathmandu', status: 'PUBLISHED' } });
  for (const y of [y2, y3]) await prisma.programBooking.create({ data: { programId: small.id, youthId: y.youthProfile!.id, status: 'CONFIRMED' } });
  const y4 = await get('youth4@sathi.dev');
  await prisma.waitlistEntry.create({ data: { programId: small.id, youthId: y4.youthProfile!.id, position: 1 } });
  await prisma.programBooking.create({ data: { programId: workshop.id, youthId: y1.youthProfile!.id, status: 'CONFIRMED' } });
  await prisma.program.update({ where: { id: workshop.id }, data: { seatsTaken: { increment: 1 } } });
  await prisma.program.create({ data: { organizationId: org1.organizationId, title: 'Peer Mentors Training', description: 'Train as a peer mentor. (Synthetic, awaiting approval)', category: 'peer-support', startsAt: new Date(Date.now() + 20 * day), endsAt: new Date(Date.now() + 20 * day + 4 * 36e5), seats: 15, mode: 'BOTH', costPaisa: 50000, status: 'PENDING_APPROVAL' } });
  const career = await prisma.program.findFirstOrThrow({ where: { title: 'Career Guidance Workshop' } });
  await prisma.programRecommendation.create({ data: { programId: career.id, youthId: y1.youthProfile!.id, counselorId: c1.counselorProfile!.id, note: 'This might help with planning after exams.' } });

  // ---- community: comments, a flagged case and a report ----
  const post = await prisma.communityPost.findFirstOrThrow({ where: { category: 'study' } });
  const ok = 'Pomodoro breaks (25/5) work well for me, and a short walk helps. (Synthetic)';
  await prisma.communityComment.create({ data: { postId: post.id, authorId: y3.id, pseudonym: 'Member-A1', body: ok, status: 'APPROVED', contentHash: hash(ok) } });
  const bad = 'You are such a loser for asking this (synthetic test content)';
  const flagged = await prisma.communityComment.create({ data: { postId: post.id, authorId: y4.id, pseudonym: 'Member-K4', body: bad, status: 'HIDDEN', contentHash: hash(bad) } });
  await prisma.moderationCase.create({ data: { targetType: 'COMMENT', targetId: flagged.id, authorId: y4.id, originalText: bad, provider: 'local-rules-v1', categories: ['bullying'], maxScore: 0.85, scores: { bullying: 0.85, spam: 0, malicious_link: 0, harassment: 0, hate: 0, threat: 0, pii: 0, self_harm: 0 }, reasons: ['Insult directed at a person'], outcome: 'HIDDEN', needsHumanReview: true, retainUntil: new Date(Date.now() + 365 * day) } });
  const spammy = 'Earn 500 daily!! click here http://bit.ly/x (synthetic)';
  const spam = await prisma.communityPost.create({ data: { authorId: y4.id, pseudonym: 'Member-K4', category: 'general', body: spammy, status: 'REJECTED', contentHash: hash(spammy) } });
  await prisma.moderationCase.create({ data: { targetType: 'POST', targetId: spam.id, authorId: y4.id, originalText: spammy, provider: 'local-rules-v1', categories: ['spam', 'malicious_link'], maxScore: 0.9, scores: { spam: 0.9, malicious_link: 0.9 }, reasons: ['Advertising pattern', 'Suspicious or shortened link'], outcome: 'REJECTED', needsHumanReview: false, retainUntil: new Date(Date.now() + 365 * day) } });

  // ---- notifications so bells aren't empty ----
  const n = (userId: string, type: string, title: string, body: string) => prisma.notification.create({ data: { userId, type, title, body, idempotencyKey: `demo:${type}:${userId}` } });
  await n(y1.id, 'APPOINTMENT_CONFIRMED', 'Session confirmed', 'Your counselor accepted your session request.');
  await n(y1.id, 'RECOMMENDATION', 'A program was recommended for you', 'See it under "Recommended for you". The choice is always yours.');
  await n(c1.id, 'BOOKING_REQUEST', 'New booking request', 'A new session request is waiting for your response.');
  await n(y3.id, 'PLAN', 'Support plan proposed', 'Open Sathi to view your support plan.');
  await n(c3.id, 'MEETING_SETUP', 'Meeting setup needed', 'Connect Google to create the meeting for an upcoming online session.');
  void pay;
}
