/* Synthetic development data only — no real personal information. */
import { PrismaClient, type Role } from '@prisma/client';
import argon2 from 'argon2';
import { seedQuestions, seedJourney, seedCommunity } from './seed-extra';
import { seedDemo } from './seed-demo';
import { seedBlog } from './seed-blog';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sathi@Dev2026';

async function user(email: string, role: Role, displayName: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email, role, displayName, emailVerifiedAt: new Date(),
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      notificationPref: { create: {} },
    },
  });
}

async function main() {
  await user('admin@sathi.dev', 'ADMIN', 'Platform Admin');

  await prisma.matchingConfiguration.upsert({
    where: { version: 1 }, update: {},
    create: { version: 1, active: true, weights: { concern: 30, specialization: 20, language: 15, availability: 15, location: 10, mode: 10 } },
  });

  const counselors = [
    { email: 'counselor1@sathi.dev', name: 'Asha Karki', concerns: ['anxiety', 'stress', 'academic'], langs: ['ne', 'en'], mode: 'BOTH', lat: 27.7172, lng: 85.324 },
    { email: 'counselor2@sathi.dev', name: 'Bikash Rai', concerns: ['substance-use', 'family', 'stress'], langs: ['ne'], mode: 'IN_PERSON', lat: 28.2096, lng: 83.9856 },
    { email: 'counselor3@sathi.dev', name: 'Sita Gurung', concerns: ['low-mood', 'relationships', 'anxiety'], langs: ['en', 'ne'], mode: 'ONLINE', lat: null, lng: null },
  ] as const;

  for (const c of counselors) {
    const u = await user(c.email, 'COUNSELOR', c.name);
    const cp = await prisma.counselorProfile.upsert({
      where: { userId: u.id }, update: {},
      create: {
        userId: u.id, qualifications: 'MA Psychology (synthetic)', experienceYears: 5, bio: 'Synthetic counselor profile for development.',
        specializations: [...c.concerns], supportedConcerns: [...c.concerns], languages: [...c.langs], ageGroups: ['15-17', '18-24'],
        mode: c.mode, latitude: c.lat, longitude: c.lng, sessionFeePaisa: 150000, verificationStatus: 'APPROVED',
        availability: { create: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 600, endMinute: 1020, slotMinutes: 60 })) },
      },
    });
    // Next 14 days of slots (UTC; 10:00–17:00 Asia/Kathmandu ≈ 04:15–11:15 UTC).
    for (let i = 1; i <= 14; i++) {
      const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + i, 4, 15));
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      for (let h = 0; h < 7; h++) {
        const startsAt = new Date(day.getTime() + h * 36e5);
        await prisma.appointmentSlot.upsert({
          where: { counselorId_startsAt: { counselorId: cp.id, startsAt } }, update: {},
          create: { counselorId: cp.id, startsAt, endsAt: new Date(startsAt.getTime() + 36e5) },
        });
      }
    }
  }

  for (const [i, name] of ['Ramesh T.', 'Priya S.'].entries()) {
    const u = await user(`youth${i + 1}@sathi.dev`, 'YOUTH', name);
    const y = await prisma.youthProfile.upsert({
      where: { userId: u.id }, update: {},
      create: { userId: u.id, ageGroup: '18-24', locationArea: 'Kathmandu', latitude: 27.7, longitude: 85.32, preferredLanguages: ['ne', 'en'], preferredMode: 'ONLINE', accessibility: [] },
    });
    if ((await prisma.wellbeingCheckIn.count({ where: { youthId: y.id } })) === 0) {
      for (let d = 28; d >= 0; d -= 3) {
        await prisma.wellbeingCheckIn.create({
          data: {
            youthId: y.id, createdAt: new Date(Date.now() - d * 864e5),
            mood: 2 + ((28 - d) % 4 === 0 ? 1 : 0) + Math.floor((28 - d) / 14), stress: Math.max(2, 8 - Math.floor((28 - d) / 6)),
            sleep: 3, energy: 2 + Math.floor((28 - d) / 14), social: 3, functioning: 3, concerns: ['stress'],
          },
        });
      }
      await prisma.supportNeedProfile.create({
        data: {
          youthId: y.id, concerns: ['anxiety', 'stress'], impactLevel: 3, durationBucket: '1-3 months', desiredSupport: ['counseling'],
          languages: ['ne', 'en'], mode: 'ONLINE', locationArea: 'Kathmandu', latitude: 27.7, longitude: 85.32, maxTravelKm: 10,
          availability: [{ day: 2, startMin: 600, endMin: 780 }, { day: 4, startMin: 840, endMin: 1020 }], accessibility: [],
        },
      });
    }
  }

  for (const [i, name] of ['Hope Youth Centre', 'Pathways Nepal'].entries()) {
    const u = await user(`org${i + 1}@sathi.dev`, 'ORGANIZATION', name);
    const existing = await prisma.organizationStaff.findFirst({ where: { userId: u.id } });
    if (existing) continue;
    await prisma.organization.create({
      data: {
        name, contactEmail: u.email, description: 'Synthetic organization.', locationArea: 'Kathmandu', languages: ['ne', 'en'],
        verificationStatus: 'APPROVED', staff: { create: { userId: u.id, isOwner: true } },
        programs: {
          create: {
            title: i ? 'Career Guidance Workshop' : 'Stress Management Workshop', description: 'A synthetic group program.',
            category: i ? 'career' : 'wellbeing', startsAt: new Date(Date.now() + 10 * 864e5), endsAt: new Date(Date.now() + 10 * 864e5 + 3 * 36e5),
            seats: 20, mode: 'IN_PERSON', locationArea: 'Kathmandu', status: 'PUBLISHED',
          },
        },
        services: { create: { title: 'Peer Support Circle', description: 'Weekly peer group.', category: 'peer-support', durationMin: 90, capacity: 12, mode: 'BOTH', status: 'PUBLISHED' } },
      },
    });
  }

  const cat = await prisma.resourceCategory.upsert({ where: { name: 'Safety' }, update: {}, create: { name: 'Safety' } });
  if ((await prisma.safetyResource.count()) === 0) {
    await prisma.safetyResource.create({
      data: { title: 'Emergency services (placeholder)', details: 'In an emergency contact local emergency services. Verify numbers with a qualified professional before deployment.', approved: false },
    });
    await prisma.resource.create({ data: { categoryId: cat.id, title: 'When to seek urgent help', body: 'Synthetic guide content.', contentType: 'GUIDE', status: 'PUBLISHED' } });
  }
  await seedQuestions(prisma);
  await seedJourney(prisma);
  await seedCommunity(prisma);
  await seedDemo(prisma, PASSWORD);
  await seedBlog(prisma);
  console.log(`Seed complete. All accounts use password: ${PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
