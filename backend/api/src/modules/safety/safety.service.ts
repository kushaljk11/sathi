import { prisma } from '../../config/database';
import { audit } from '../../helpers/audit.helper';
import { youthOf } from '../../helpers/identity.helper';
import { getSetting } from '../../helpers/settings.helper';
import { SAFETY_ESCALATED_MESSAGE, SAFETY_NOT_ESCALATED_MESSAGE } from './safety.constants';
import type { ScreeningInput } from './safety.types';

export const listQuestions = () => prisma.assessmentQuestion.findMany({ where: { active: true, isSafety: true }, orderBy: { step: 'asc' } });

export const listResources = () =>
  prisma.safetyResource.findMany({ orderBy: { order: 'asc' }, select: { id: true, title: true, phone: true, url: true, details: true, language: true, approved: true, order: true } });

export async function createScreening(userId: string, answers: ScreeningInput['answers']) {
  const y = await youthOf(userId);
  const rules = await getSetting('safety.rules');
  const escalated = rules.escalateOnAnyYes.some((k) => answers[k] === 'yes');
  const s = await prisma.safetyScreening.create({ data: { youthId: y.id, answers, escalated, ruleVersion: rules.ruleVersion } });
  if (escalated) await audit(null, 'SAFETY_ESCALATION', 'SafetyScreening', s.id); // no answer content in logs
  const resources = await prisma.safetyResource.findMany({ orderBy: { order: 'asc' } });
  return { escalated, resources, message: escalated ? SAFETY_ESCALATED_MESSAGE : SAFETY_NOT_ESCALATED_MESSAGE };
}
