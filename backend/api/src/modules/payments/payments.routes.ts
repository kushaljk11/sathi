import { Router } from 'express';
import { z } from 'zod';
import { asyncH, ok, prisma, validate } from '../../lib/core';
import { env } from '../../lib/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { availableProviders, initiatePayment, verifyAndSettle } from './payments.service';
import { esewa } from './gateways';

const r = Router();
const front = (ref: string, status: string) => `${env.FRONTEND_URL}/youth/payment-result?ref=${encodeURIComponent(ref)}&status=${status}`;

r.get('/providers', (_req, res) => { ok(res, availableProviders()); });

r.post('/initiate', authenticate, requireRole('YOUTH'), asyncH(async (req, res) => {
  const b = validate(z.object({ provider: z.enum(['ESEWA', 'KHALTI']), appointmentId: z.string().uuid().optional(), programBookingId: z.string().uuid().optional() })
    .refine((x) => !!x.appointmentId !== !!x.programBookingId, 'Provide exactly one target'), req.body);
  ok(res, await initiatePayment(req.user!.id, b.provider, b), 201);
}));

/** Payer polls status; triggers a server-side re-verification if still pending. */
r.get('/:reference', authenticate, asyncH(async (req, res) => {
  const ref = String(req.params.reference);
  const p = await prisma.payment.findFirst({ where: { reference: ref, payerUserId: req.user!.id } });
  if (!p) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } });
  const fresh = ['INITIATED', 'PENDING'].includes(p.status) ? await verifyAndSettle(ref) : p;
  ok(res, { reference: fresh.reference, status: fresh.status, amountPaisa: fresh.amountPaisa, provider: fresh.provider, appointmentId: fresh.appointmentId, programBookingId: fresh.programBookingId });
}));

r.get('/', authenticate, asyncH(async (req, res) =>
  ok(res, await prisma.payment.findMany({ where: { payerUserId: req.user!.id }, orderBy: { createdAt: 'desc' }, include: { refunds: true }, take: 100 }))));

// ---- Gateway return URLs (browser redirects). Never trusted: we always verify server-to-server. ----
r.get('/esewa/return/:reference', asyncH(async (req, res) => {
  const ref = String(req.params.reference);
  const data = typeof req.query.data === 'string' ? esewa.verifyCallbackSignature(req.query.data) : null;
  if (!data || data.transaction_uuid !== ref) return res.redirect(front(ref, 'invalid'));
  const p = await verifyAndSettle(ref);
  res.redirect(front(ref, p.status));
}));
r.get('/esewa/failed/:reference', asyncH(async (req, res) => {
  const ref = String(req.params.reference);
  const p = await verifyAndSettle(ref).catch(() => null);
  res.redirect(front(ref, p?.status ?? 'FAILED'));
}));
r.get('/khalti/return/:reference', asyncH(async (req, res) => {
  const ref = String(req.params.reference);
  const p = await prisma.payment.findUnique({ where: { reference: ref } });
  if (!p || (typeof req.query.pidx === 'string' && req.query.pidx !== p.providerRef)) return res.redirect(front(ref, 'invalid'));
  const settled = await verifyAndSettle(ref);
  res.redirect(front(ref, settled.status));
}));

export default r;
