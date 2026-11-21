import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/** Configurable assessment and safety questions (synthetic; must be reviewed by a qualified professional). */
export async function seedQuestions(prisma: PrismaClient) {
  const qs: { key: string; step: number; prompt: string; type: string; isSafety?: boolean; options?: [string, string][] }[] = [
    { key: 'concerns', step: 1, prompt: 'What would you like support with?', type: 'MULTI', options: [['anxiety', 'Feeling anxious or worried'], ['stress', 'Stress'], ['academic', 'Studies or exams'], ['low-mood', 'Low mood'], ['family', 'Family'], ['relationships', 'Relationships'], ['substance-use', 'Alcohol or drug use'], ['career', 'Career or future'], ['sleep', 'Sleep']] },
    { key: 'impact', step: 2, prompt: 'How much is this affecting your daily life?', type: 'SLIDER' },
    { key: 'duration', step: 3, prompt: 'How long has this been going on?', type: 'SINGLE', options: [['<2 weeks', 'Less than 2 weeks'], ['2-4 weeks', '2–4 weeks'], ['1-3 months', '1–3 months'], ['3-12 months', '3–12 months'], ['>1 year', 'More than a year']] },
    { key: 'desiredSupport', step: 4, prompt: 'What kind of support would help?', type: 'MULTI', options: [['counseling', 'Talking to a counselor'], ['skills', 'Learning coping skills'], ['group', 'Group programs'], ['information', 'Information and resources']] },
    { key: 'languages', step: 5, prompt: 'Which languages are you comfortable with?', type: 'MULTI', options: [['ne', 'Nepali'], ['en', 'English'], ['mai', 'Maithili'], ['new', 'Newari']] },
    { key: 'locationArea', step: 6, prompt: 'Where are you based?', type: 'TEXT' },
    { key: 'mode', step: 7, prompt: 'How would you like to meet?', type: 'SINGLE', options: [['ONLINE', 'Online'], ['IN_PERSON', 'In person'], ['BOTH', 'Either']] },
    { key: 'availability', step: 8, prompt: 'When are you usually available?', type: 'AVAILABILITY' },
    { key: 'accessibility', step: 9, prompt: 'Any accessibility needs?', type: 'MULTI', options: [['wheelchair', 'Wheelchair access'], ['sign-language', 'Sign language'], ['captions', 'Captions'], ['low-bandwidth', 'Low-bandwidth calls']] },
    { key: 'harm_self_now', step: 1, prompt: 'Are you thinking about harming yourself right now?', type: 'YES_NO', isSafety: true },
    { key: 'harm_others_now', step: 2, prompt: 'Are you thinking about harming someone else right now?', type: 'YES_NO', isSafety: true },
    { key: 'unsafe_now', step: 3, prompt: 'Do you feel unsafe where you are right now?', type: 'YES_NO', isSafety: true },
  ];
  for (const q of qs) {
    if (await prisma.assessmentQuestion.findUnique({ where: { key: q.key } })) continue;
    await prisma.assessmentQuestion.create({
      data: { key: q.key, step: q.step, prompt: q.prompt, type: q.type, isSafety: q.isSafety ?? false, options: { create: (q.options ?? []).map(([value, label], order) => ({ value, label, order })) } },
    });
  }
  for (const name of ['Wellbeing', 'Study skills', 'Relationships']) await prisma.resourceCategory.upsert({ where: { name }, update: {}, create: { name } });
  const wb = await prisma.resourceCategory.findUniqueOrThrow({ where: { name: 'Wellbeing' } });
  if ((await prisma.resource.count({ where: { categoryId: wb.id } })) === 0)
    await prisma.resource.createMany({
      data: [
        { categoryId: wb.id, title: 'Simple breathing exercise', body: 'Breathe in for 4, hold for 4, out for 6. Repeat five times. (Synthetic content)', contentType: 'GUIDE', status: 'PUBLISHED' },
        { categoryId: wb.id, title: 'तनाव व्यवस्थापनका सरल उपाय', body: 'नियमित निद्रा, हिँडडुल र साथीसँग कुरा गर्नुहोस्। (Synthetic content)', contentType: 'ARTICLE', language: 'ne', status: 'PUBLISHED' },
      ],
    });
}

/** A fully synthetic support journey between youth1 and counselor1. */
export async function seedJourney(prisma: PrismaClient) {
  const youthU = await prisma.user.findUniqueOrThrow({ where: { email: 'youth1@sathi.dev' }, include: { youthProfile: true } });
  const cU = await prisma.user.findUniqueOrThrow({ where: { email: 'counselor1@sathi.dev' }, include: { counselorProfile: true } });
  const y = youthU.youthProfile!, c = cU.counselorProfile!;
  if (await prisma.supportRelationship.findFirst({ where: { youthId: y.id, counselorId: c.id } })) return;
  const start = new Date(Date.now() - 14 * 864e5);
  start.setUTCMinutes(15, 0, 0);
  const slot = await prisma.appointmentSlot.create({ data: { counselorId: c.id, startsAt: start, endsAt: new Date(start.getTime() + 36e5), isBooked: true } });
  const rel = await prisma.supportRelationship.create({ data: { youthId: y.id, counselorId: c.id, startedAt: start, conversation: { create: {} } } });
  const appt = await prisma.appointment.create({ data: { youthId: y.id, counselorId: c.id, slotId: slot.id, relationshipId: rel.id, status: 'COMPLETED', mode: 'ONLINE', feePaisa: 0, startsAt: slot.startsAt, endsAt: slot.endsAt } });
  await prisma.sessionRecord.create({ data: { appointmentId: appt.id, summary: 'Discussed exam stress and sleep routine. (Synthetic)', topics: ['stress', 'sleep'], nextSteps: 'Try a wind-down routine for one week.' } });
  for (const category of ['SUPPORT_NEED_PROFILE', 'CHECKIN_TRENDS'] as const)
    await prisma.consentRecord.create({ data: { youthId: y.id, recipientId: c.id, recipientType: 'COUNSELOR', category, purpose: 'Support relationship', granted: true, history: { create: { granted: true } } } });
  const plan = await prisma.supportPlan.create({
    data: { relationshipId: rel.id, status: 'ACTIVE', versions: { create: { version: 1, title: 'Managing exam stress', description: 'Build routines that support sleep and study balance. (Synthetic)', startDate: start, reviewDate: new Date(Date.now() + 14 * 864e5), agreedAt: new Date(start.getTime() + 864e5) } } },
  });
  const goal = await prisma.goal.create({ data: { planId: plan.id, title: 'Improve sleep routine', startDate: start, targetDate: new Date(Date.now() + 14 * 864e5), status: 'IN_PROGRESS' } });
  const tasks = [['Phone off 30 minutes before bed', 'IN_PROGRESS'], ['Write 3 things that went well each evening', 'PENDING'], ['Short walk after lunch', 'COMPLETED']] as const;
  for (const [title, status] of tasks)
    await prisma.supportTask.create({ data: { goalId: goal.id, title, status, dueDate: new Date(Date.now() + 7 * 864e5), completedAt: status === 'COMPLETED' ? new Date() : null, history: { create: { to: status, changedBy: cU.id } } } });
  const ms = [['ASSESSMENT_COMPLETED', null], ['COUNSELOR_CONNECTED', rel.id], ['FIRST_SESSION', rel.id], ['PLAN_AGREED', rel.id]] as const;
  for (const [kind, rid] of ms) await prisma.progressMilestone.create({ data: { youthUserId: youthU.id, kind, relationshipId: rid } });
  for (const t of ['Support relationship started', 'Session completed', 'Support plan agreed']) await prisma.timelineEvent.create({ data: { relationshipId: rel.id, type: 'SEED', title: t } });
}

export async function seedCommunity(prisma: PrismaClient) {
  if (await prisma.communityPost.count()) return;
  const u = await prisma.user.findUniqueOrThrow({ where: { email: 'youth2@sathi.dev' } });
  const posts = [['study', 'Exams are coming up. What helps you take breaks without feeling guilty? (Synthetic)'], ['wellbeing-tips', 'A 10-minute walk in the evening has really helped my sleep. (Synthetic)']];
  for (const [category, body] of posts)
    await prisma.communityPost.create({ data: { authorId: u.id, pseudonym: 'Member-SEED', category, body, status: 'APPROVED', contentHash: createHash('sha256').update(body).digest('hex') } });
}
