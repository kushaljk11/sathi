/* Synthetic, general-awareness blog content for development. Not clinical advice; replace with reviewed content before launch. */
import type { PrismaClient } from '@prisma/client';

const CATS = ['Mental Wellbeing', 'Youth Awareness', 'Stress Management', 'Personal Development', 'Substance-use Awareness', 'Healthy Habits', 'Support and Recovery'];
const slug = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');
const NOTE = '\n\n— This article shares general wellbeing information for awareness. It is not professional or clinical advice. If you are struggling, consider talking to a qualified counselor, and if you are in danger, contact local emergency services. (Synthetic development content.)';

const ARTICLES: { title: string; cat: string; excerpt: string; body: string; featured?: boolean; daysAgo: number }[] = [
  {
    title: 'Small Daily Habits That Support Your Wellbeing', cat: 'Healthy Habits', featured: true, daysAgo: 2,
    excerpt: 'Wellbeing is rarely about big changes. Here are small, realistic habits many young people find helpful.',
    body: 'Wellbeing often grows from small, repeatable actions rather than dramatic changes.\n\nRegular sleep and wake times help your body find a rhythm. A short walk outside, even ten minutes, can be a reset during a busy day. Drinking water and eating regular meals give your mind steady energy.\n\nStaying connected matters too. A message to a friend, a conversation with family, or joining a group activity can make a hard week feel lighter.\n\nFinally, notice how you feel. A quick check-in — how is my mood, my energy, my stress? — helps you spot patterns early and decide what support you might need.',
  },
  {
    title: 'Understanding Exam Stress', cat: 'Stress Management', daysAgo: 6,
    excerpt: 'Feeling pressure before exams is common. Learn what stress is, why it happens and gentle ways to manage it.',
    body: 'Some stress before exams is a normal response — it can even help you focus. It becomes a problem when it stays high for a long time or gets in the way of sleep, eating or daily life.\n\nBreaking study into short sessions with real breaks, planning what you will cover each day, and keeping some time for rest are approaches many students find useful.\n\nTalking about the pressure with someone you trust can also help. You do not have to manage everything alone.',
  },
  {
    title: 'How to Talk to Someone When You Are Struggling', cat: 'Youth Awareness', daysAgo: 10,
    excerpt: 'Reaching out can feel difficult. A few ideas for starting the conversation with a friend, family member or counselor.',
    body: 'Starting a conversation about how you feel can be the hardest step. Choose someone you trust and a time when you will not be rushed.\n\nYou might begin simply: "I have been finding things hard lately and wanted to talk." You do not need to have the right words or explain everything at once.\n\nIf talking face to face feels too much, a written message can be a good start. Counselors are trained to listen without judgement and to help you think through options.',
  },
  {
    title: 'What Happens in a First Counseling Session?', cat: 'Support and Recovery', daysAgo: 14,
    excerpt: 'Wondering what to expect from counseling? Here is a general picture of a first session.',
    body: 'A first session is usually about getting to know each other. A counselor may ask what brings you, what you hope will change and what support you already have.\n\nYou choose what to share. It is okay to say you are not ready to talk about something yet. Many people find it helpful to agree on small goals together and review them over time.\n\nOn Sathi, you decide what information is shared with your counselor before you book, and you can change those choices later in your privacy settings.',
  },
  {
    title: 'Building Confidence Through Small Goals', cat: 'Personal Development', daysAgo: 20,
    excerpt: 'Big goals can feel overwhelming. Breaking them into small steps builds momentum and confidence.',
    body: 'Confidence often grows from evidence that you can do things. Small, specific goals create that evidence.\n\nInstead of "get better at studying", try "study for 25 minutes after dinner on Monday and Wednesday". Track what you did, not just the outcome, and notice progress.\n\nIf a goal is not working, adjust it. Changing a plan is part of the process, not a failure.',
  },
  {
    title: 'Alcohol and Drugs: Getting Accurate Information', cat: 'Substance-use Awareness', daysAgo: 26,
    excerpt: 'Myths about substances are common. Why reliable information and supportive conversations matter.',
    body: 'Young people hear many mixed messages about alcohol and drugs. Reliable information from trusted sources helps you make informed decisions.\n\nIf you are worried about your own use or someone else\'s, talking to a counselor or a trusted adult is a good step. Support services can help without judgement.\n\nSathi can help you find counselors and programs related to substance-use awareness and support.',
  },
  {
    title: 'Why Sleep Matters for Your Mood', cat: 'Mental Wellbeing', daysAgo: 33,
    excerpt: 'Sleep and mood are closely linked. A few practical ideas for more restful nights.',
    body: 'When sleep is short or irregular, many people notice they feel more irritable, anxious or low. Sleep supports concentration, memory and emotional balance.\n\nKeeping screens away for the last half hour before bed, a regular bedtime, and a calm wind-down routine are simple steps that many find helpful.\n\nTracking sleep in your Sathi check-ins can help you and your counselor notice patterns over time.',
  },
];

export async function seedBlog(prisma: PrismaClient) {
  for (const name of CATS) await prisma.blogCategory.upsert({ where: { slug: slug(name) }, update: {}, create: { name, slug: slug(name) } });
  if (await prisma.blogArticle.count()) return;
  for (const a of ARTICLES) {
    const cat = await prisma.blogCategory.findUniqueOrThrow({ where: { slug: slug(a.cat) } });
    const body = a.body + NOTE;
    await prisma.blogArticle.create({
      data: {
        slug: slug(a.title), title: a.title, excerpt: a.excerpt, body, categoryId: cat.id, authorName: 'Sathi Editorial Team', status: 'PUBLISHED',
        featured: !!a.featured, readingMinutes: Math.max(1, Math.round(body.split(/\s+/).length / 200)), publishedAt: new Date(Date.now() - a.daysAgo * 864e5),
      },
    });
  }
  const cat = await prisma.blogCategory.findUniqueOrThrow({ where: { slug: slug('Mental Wellbeing') } });
  await prisma.blogArticle.create({ data: { slug: 'draft-coping-with-change', title: 'Coping With Change (draft)', excerpt: 'An unpublished draft for testing the admin workflow.', body: 'Draft content awaiting review by the editorial team before publication.' + NOTE, categoryId: cat.id, authorName: 'Sathi Editorial Team', status: 'DRAFT' } });
}
