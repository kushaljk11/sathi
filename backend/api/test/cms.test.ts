import { describe, it, expect, beforeAll } from 'vitest';
import { api, auth, makeUser, truncateAll } from './helpers';
import { prisma } from '../src/config/database';

beforeAll(truncateAll);

describe('blog CMS', () => {
  it('admin drafts, publishes, archives; public only sees published; non-admins blocked', async () => {
    const admin = await makeUser('ADMIN'), youth = await makeUser('YOUTH');
    const cat = await api().post('/api/v1/admin/cms/categories').set(auth(admin.token)).send({ name: 'Healthy Habits' });
    expect(cat.status).toBe(201);
    const body = { title: 'Sleep and your mood', excerpt: 'Why sleep matters for how we feel.', body: 'word '.repeat(450), categoryId: cat.body.data.id, authorName: 'Editorial Team', status: 'DRAFT', featured: true };
    expect((await api().post('/api/v1/admin/cms/articles').set(auth(youth.token)).send(body)).status).toBe(403);
    const draft = await api().post('/api/v1/admin/cms/articles').set(auth(admin.token)).send(body);
    expect(draft.body.data).toMatchObject({ slug: 'sleep-and-your-mood', readingMinutes: 2, status: 'DRAFT' });
    expect((await api().get('/api/v1/blog/articles/sleep-and-your-mood')).status).toBe(404); // drafts invisible
    await api().put(`/api/v1/admin/cms/articles/${draft.body.data.id}`).set(auth(admin.token)).send({ ...body, status: 'PUBLISHED' });
    const list = await api().get('/api/v1/blog/articles?q=sleep');
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.featured.slug).toBe('sleep-and-your-mood');
    expect((await api().get('/api/v1/blog/articles/sleep-and-your-mood')).body.data.article.title).toBe('Sleep and your mood');
    // scheduled (future) publication stays hidden
    await api().post('/api/v1/admin/cms/articles').set(auth(admin.token)).send({ ...body, title: 'Future post', status: 'PUBLISHED', publishedAt: new Date(Date.now() + 864e5), featured: false });
    expect((await api().get('/api/v1/blog/articles')).body.data.total).toBe(1);
    await api().put(`/api/v1/admin/cms/articles/${draft.body.data.id}`).set(auth(admin.token)).send({ ...body, status: 'ARCHIVED' });
    expect((await api().get('/api/v1/blog/articles')).body.data.total).toBe(0);
    expect((await api().get('/api/v1/blog/sitemap.xml')).text).toContain('<loc>http://localhost:5173/features</loc>');
  });

  it('cover upload accepts only real images', async () => {
    const admin = await makeUser('ADMIN');
    const cat = await prisma.blogCategory.create({ data: { name: 'Test cat', slug: 'test-cat' } });
    const a = await prisma.blogArticle.create({ data: { slug: 'cov', title: 'Cover test', excerpt: 'x', body: 'y', categoryId: cat.id, authorName: 'A' } });
    const fake = await api().post(`/api/v1/admin/cms/articles/${a.id}/cover`).set(auth(admin.token)).attach('file', Buffer.from('<svg onload=alert(1)>'), 'x.png');
    expect(fake.status).toBe(400);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await api().post(`/api/v1/admin/cms/articles/${a.id}/cover`).set(auth(admin.token)).attach('file', png, 'c.png');
    expect(ok.body.data.coverImageKey).toMatch(/\.png$/);
  });
});

describe('contact form', () => {
  it('validates, stores, flags honeypot/fast/spam submissions, and notifies admins only for real ones', async () => {
    const admin = await makeUser('ADMIN');
    expect((await api().post('/api/v1/contact').send({ name: 'A', email: 'bad', subject: 'x', message: 'short' })).status).toBe(400);
    const good = { name: 'Asha', email: 'asha@example.com', subject: 'Question about programs', message: 'How do organizations join Sathi?', startedAt: Date.now() - 10_000 };
    expect((await api().post('/api/v1/contact').send(good)).status).toBe(201);
    expect((await api().post('/api/v1/contact').send({ ...good, website: 'http://spam' })).status).toBe(400); // honeypot filled
    await api().post('/api/v1/contact').send({ ...good, startedAt: Date.now() }); // too fast → SPAM
    await api().post('/api/v1/contact').send({ ...good, message: 'BUY NOW cheap followers http://a.xyz http://b.xyz http://c.xyz' });
    expect(await prisma.contactMessage.count({ where: { status: 'NEW' } })).toBe(1);
    expect(await prisma.contactMessage.count({ where: { status: 'SPAM' } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'CONTACT' } })).toBe(1);
    const inbox = await api().get('/api/v1/admin/cms/contact-messages?status=NEW').set(auth(admin.token));
    expect(inbox.body.data.items[0]).not.toHaveProperty('ipHash');
  });
});
