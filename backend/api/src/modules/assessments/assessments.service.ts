import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import { youthOf } from '../../helpers/identity.helper';
import { recordMilestone } from '../support/support.service';
import { MAX_DRAFT_CHARS } from './assessments.constants';
import type { AssessmentAnswersInput } from './assessments.types';
import { assessmentAnswers } from './assessments.validation';

const needProfileData = (youthId: string, v: AssessmentAnswersInput) => ({
  youthId,
  concerns: v.concerns,
  impactLevel: v.impact,
  durationBucket: v.duration,
  desiredSupport: v.desiredSupport,
  languages: v.languages,
  mode: v.mode,
  locationArea: v.locationArea,
  latitude: v.latitude,
  longitude: v.longitude,
  maxTravelKm: v.maxTravelKm,
  availability: v.availability,
  accessibility: v.accessibility,
});

/** Configurable question bank (active only). */
export const listQuestions = () =>
  prisma.assessmentQuestion.findMany({ where: { active: true, isSafety: false }, include: { options: { orderBy: { order: 'asc' } } }, orderBy: { step: 'asc' } });

/** Start or resume the in-progress assessment (save & resume). */
export async function startOrResume(userId: string) {
  const y = await youthOf(userId);
  const existing = await prisma.assessment.findFirst({ where: { youthId: y.id, status: 'IN_PROGRESS' }, orderBy: { createdAt: 'desc' } });
  return existing ?? prisma.assessment.create({ data: { youthId: y.id } });
}

export async function saveDraft(userId: string, assessmentId: string, draft: Record<string, unknown>) {
  const y = await youthOf(userId);
  if (JSON.stringify(draft).length > MAX_DRAFT_CHARS) throw new AppError(413, 'Draft too large');
  const a = await prisma.assessment.updateMany({ where: { id: assessmentId, youthId: y.id, status: 'IN_PROGRESS' }, data: { draft: draft as Prisma.InputJsonValue } });
  if (!a.count) throw notFound('Assessment');
  return { saved: true };
}

/** The answers are parsed here (not in the route) so ownership (404) and "already submitted" (409) are reported before input validation (400). */
export async function submit(userId: string, assessmentId: string, rawAnswers: unknown) {
  const y = await youthOf(userId);
  const a = await prisma.assessment.findFirst({ where: { id: assessmentId, youthId: y.id } });
  if (!a) throw notFound('Assessment');
  if (a.status !== 'IN_PROGRESS') throw new AppError(409, 'Already submitted');
  const v = assessmentAnswers.parse(rawAnswers);
  const profile = await prisma.$transaction(async (tx) => {
    await tx.assessment.update({ where: { id: a.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), draft: undefined } });
    await tx.assessmentResponse.createMany({ data: Object.entries(v).map(([questionKey, value]) => ({ assessmentId: a.id, questionKey, value: value as Prisma.InputJsonValue })) });
    return tx.supportNeedProfile.create({ data: { ...needProfileData(y.id, v), assessmentId: a.id } });
  });
  await recordMilestone(userId, 'ASSESSMENT_COMPLETED', null);
  return profile;
}

export async function history(userId: string) {
  const y = await youthOf(userId);
  return prisma.assessment.findMany({ where: { youthId: y.id }, orderBy: { createdAt: 'desc' }, include: { needProfile: true } });
}

export async function latestNeedProfile(userId: string) {
  const y = await youthOf(userId);
  return prisma.supportNeedProfile.findFirst({ where: { youthId: y.id }, orderBy: { createdAt: 'desc' } });
}

/** Update the Support Need Profile directly (creates a new version; history kept). */
export async function updateNeedProfile(userId: string, v: AssessmentAnswersInput) {
  const y = await youthOf(userId);
  return prisma.supportNeedProfile.create({ data: needProfileData(y.id, v) });
}
