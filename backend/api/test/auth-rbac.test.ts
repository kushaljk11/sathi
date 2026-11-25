import { describe, it, expect, beforeAll } from 'vitest';
import { api, auth, makeUser, truncateAll, PASSWORD } from './helpers';
import { prisma } from '../src/config/database';

beforeAll(truncateAll);

describe('authentication', () => {
  it('registers, rejects duplicate, never allows self-registered ADMIN', async () => {
    const body = { email: 'new@test.dev', password: 'a-strong-pass-1', displayName: 'New Youth', role: 'YOUTH' };
    expect((await api().post('/api/v1/auth/register').send(body)).status).toBe(201);
    expect((await api().post('/api/v1/auth/register').send(body)).status).toBe(409);
    expect((await api().post('/api/v1/auth/register').send({ ...body, email: 'x@test.dev', role: 'ADMIN' })).status).toBe(400);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'new@test.dev' } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('logs in with HttpOnly refresh cookie and rejects bad password', async () => {
    const { user } = await makeUser('YOUTH');
    const ok = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(String(ok.headers['set-cookie'])).toMatch(/sathi_rt=.*HttpOnly.*SameSite=Strict/i);
    expect((await api().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong' })).status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { cookie } = await makeUser('YOUTH');
    const r1 = await api().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(r1.status).toBe(200);
    const newCookie = r1.headers['set-cookie'] as unknown as string[];
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', cookie)).body.error.code).toBe('TOKEN_REUSE'); // old token reused
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', newCookie)).status).toBe(401); // whole family revoked
  });

  it('suspended users cannot use access tokens', async () => {
    const { user, token } = await makeUser('YOUTH');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    expect((await api().get('/api/v1/auth/me').set(auth(token))).status).toBe(401);
  });

  it('email verification and password reset tokens are single-use', async () => {
    expect((await api().post('/api/v1/auth/verify-email').send({ token: 'invalid-token-xyz' })).status).toBe(400);
    const r = await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.dev' });
    expect(r.status).toBe(200); // no user enumeration
  });
});

describe('role-based access control (deny by default)', () => {
  it('blocks cross-role access', async () => {
    const youth = await makeUser('YOUTH');
    const counselor = await makeUser('COUNSELOR');
    const org = await makeUser('ORGANIZATION');
    expect((await api().get('/api/v1/admin/users').set(auth(youth.token))).status).toBe(403);
    expect((await api().get('/api/v1/admin/analytics').set(auth(counselor.token))).status).toBe(403);
    expect((await api().post('/api/v1/check-ins').set(auth(org.token)).send({})).status).toBe(403);
    expect((await api().get('/api/v1/programs/org/programs').set(auth(youth.token))).status).toBe(403);
    expect((await api().get('/api/v1/users/me/export')).status).toBe(401);
  });

  it('admin can suspend and every action is audited', async () => {
    const admin = await makeUser('ADMIN');
    const youth = await makeUser('YOUTH');
    const r = await api().post(`/api/v1/admin/users/${youth.user.id}/status`).set(auth(admin.token)).send({ status: 'SUSPENDED', reason: 'test' });
    expect(r.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'USER_SUSPENDED', entityId: youth.user.id } })).toBe(1);
  });

  it('admin cannot read private counselor notes', async () => {
    const admin = await makeUser('ADMIN');
    const rel = '00000000-0000-0000-0000-000000000000';
    expect((await api().get(`/api/v1/support/relationships/${rel}/notes`).set(auth(admin.token))).status).toBe(403);
  });
});

describe('account privacy', () => {
  it('exports own data and deletes account (anonymised, sessions revoked)', async () => {
    const y = await makeUser('YOUTH');
    await api().post('/api/v1/check-ins').set(auth(y.token)).send({ mood: 3, stress: 4, sleep: 3, energy: 3, social: 3, functioning: 3 });
    const ex = await api().get('/api/v1/users/me/export').set(auth(y.token));
    expect(ex.body.data.youth.checkIns).toHaveLength(1);
    expect((await api().post('/api/v1/users/me/delete').set(auth(y.token)).send({ password: PASSWORD })).status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: y.user.id } });
    expect(u.status).toBe('DELETED');
    expect(u.email).toMatch(/sathi\.invalid$/);
  });
});
