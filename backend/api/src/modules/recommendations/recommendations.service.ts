import { prisma } from '../../config/database';
import { notFound } from '../../core/errors/app.error';
import type { AuthUser } from '../../core/middleware/auth.middleware';
import { counselorOf, youthOf } from '../../helpers/identity.helper';
import { notify } from '../../helpers/notification.helper';
import { PUBLIC_PROGRAM_SELECT } from '../programs/programs.constants';
import { rankPrograms } from '../programs/programs.service';
import { relationshipFor } from '../support/support.service';
import type { CreateRecommendationInput, RankQuery, RespondInput } from './recommendations.types';

export async function myRecommendations(userId: string) {
  const y = await youthOf(userId);
  const recs = await prisma.programRecommendation.findMany({
    where: { youthId: y.id, status: { in: ['PENDING', 'SAVED', 'BOOKED'] } },
    include: { program: { select: PUBLIC_PROGRAM_SELECT } },
    orderBy: { createdAt: 'desc' },
  });
  const names = await prisma.counselorProfile.findMany({ where: { id: { in: recs.map((r) => r.counselorId) } }, select: { id: true, user: { select: { displayName: true } } } });
  return recs.map((r) => ({ ...r, counselorName: names.find((n) => n.id === r.counselorId)?.user.displayName }));
}

export async function respondToRecommendation(userId: string, id: string, action: RespondInput['action']) {
  const y = await youthOf(userId);
  const status = action === 'SAVE' ? 'SAVED' : 'DISMISSED';
  const u = await prisma.programRecommendation.updateMany({ where: { id, youthId: y.id }, data: { status } });
  if (!u.count) throw notFound('Recommendation');
  return { status };
}

export async function rankForRelationship(user: AuthUser, relationshipId: string, q: RankQuery) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true, activeOnly: true });
  const programs = await prisma.program.findMany({
    where: { status: 'PUBLISHED', startsAt: { gt: new Date() }, ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { category: { contains: q.q, mode: 'insensitive' } }] } : {}) },
    select: PUBLIC_PROGRAM_SELECT,
    take: 100,
  });
  // Ranking uses the need profile only if the youth consented to share it.
  const consent = await prisma.consentRecord.findUnique({
    where: { youthId_recipientId_category: { youthId: rel.youthId, recipientId: rel.counselorId, category: 'SUPPORT_NEED_PROFILE' } },
  });
  const need = consent?.granted && !consent.withdrawnAt ? await prisma.supportNeedProfile.findFirst({ where: { youthId: rel.youthId }, orderBy: { createdAt: 'desc' } }) : null;
  return { ranked: rankPrograms(programs, need), usedNeedProfile: !!need };
}

export async function createRecommendation(user: AuthUser, b: CreateRecommendationInput) {
  const { rel } = await relationshipFor(b.relationshipId, user, { counselorOnly: true, activeOnly: true });
  const c = await counselorOf(user.id);
  const p = await prisma.program.findFirst({ where: { id: b.programId, status: 'PUBLISHED' } });
  if (!p) throw notFound('Program');
  const rec = await prisma.programRecommendation.create({ data: { programId: p.id, youthId: rel.youthId, counselorId: c.id, note: b.note } });
  await notify(rel.youth.userId, {
    type: 'RECOMMENDATION',
    title: 'A program was recommended for you',
    body: 'See it under "Recommended for you". The choice is always yours.',
    key: `rec:${rec.id}`,
  });
  return rec;
}

export async function sentRecommendations(user: AuthUser, relationshipId: string) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true });
  const c = await counselorOf(user.id);
  return prisma.programRecommendation.findMany({
    where: { youthId: rel.youthId, counselorId: c.id },
    include: { program: { select: { title: true, startsAt: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
