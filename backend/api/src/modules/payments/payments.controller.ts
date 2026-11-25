import { env } from '../../config/env';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './payments.service';
import type { InitiatePaymentInput } from './payments.types';

const paymentResultUrl = (reference: string, status: string) => `${env.FRONTEND_URL}/youth/payment-result?ref=${encodeURIComponent(reference)}&status=${status}`;

export const providers = asyncHandler(async (_req, res) => {
  ok(res, service.availableProviders());
});

export const initiate = asyncHandler(async (req, res) => {
  const input = req.body as InitiatePaymentInput;
  ok(res, await service.initiatePayment(req.user!.id, input.provider, input), 201);
});

export const status = asyncHandler(async (req, res) => {
  ok(res, await service.getPaymentStatus(req.user!.id, String(req.params.reference)));
});

export const list = asyncHandler(async (req, res) => {
  ok(res, await service.listPayments(req.user!.id));
});

// ---- Gateway return URLs (browser redirects). Never trusted: we always verify server-to-server. ----
export const esewaReturn = asyncHandler(async (req, res) => {
  const ref = String(req.params.reference);
  const data = typeof req.query.data === 'string' ? req.query.data : undefined;
  res.redirect(paymentResultUrl(ref, await service.esewaReturnStatus(ref, data)));
});

export const esewaFailed = asyncHandler(async (req, res) => {
  const ref = String(req.params.reference);
  res.redirect(paymentResultUrl(ref, await service.esewaFailedStatus(ref)));
});

export const khaltiReturn = asyncHandler(async (req, res) => {
  const ref = String(req.params.reference);
  const pidx = typeof req.query.pidx === 'string' ? req.query.pidx : undefined;
  res.redirect(paymentResultUrl(ref, await service.khaltiReturnStatus(ref, pidx)));
});
