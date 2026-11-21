import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { calculateRefund } from '@sathi/shared';
import { prisma, HttpError, notFound, audit, getSetting } from '../../lib/core';
import { esewaConfigured, khaltiConfigured } from '../../lib/env';
import { notify } from '../../lib/notify';
import { esewa, khalti, type VerifyResult } from './gateways';

export const availableProviders = () => ({ ESEWA: esewaConfigured, KHALTI: khaltiConfigured });

async function targetFor(userId: string, b: { appointmentId?: string; programBookingId?: string }) {
  if (b.appointmentId) {
    const a = await prisma.appointment.findUnique({ where: { id: b.appointmentId }, include: { youth: true } });
    if (!a || a.youth.userId !== userId) throw notFound('Appointment');
    if (a.status !== 'PENDING_PAYMENT') throw new HttpError(409, 'This appointment does not need payment');
    return { amount: a.feePaisa, name: 'Counseling session', data: { appointmentId: a.id } };
  }
  const pb = await prisma.programBooking.findUnique({ where: { id: b.programBookingId }, include: { youth: true, program: true } });
  if (!pb || pb.youth.userId !== userId) throw notFound('Booking');
  if (pb.status !== 'PENDING_PAYMENT') throw new HttpError(409, 'This booking does not need payment');
  return { amount: pb.program.costPaisa, name: pb.program.title.slice(0, 50), data: { programBookingId: pb.id } };
}

export async function initiatePayment(userId: string, provider: 'ESEWA' | 'KHALTI', target: { appointmentId?: string; programBookingId?: string }) {
  if (!availableProviders()[provider]) throw new HttpError(503, `${provider} is not configured on this server`, 'PROVIDER_UNAVAILABLE');
  const t = await targetFor(userId, target);
  const reference = randomUUID();
  const payment = await prisma.payment.create({ data: { ...t.data, provider, reference, amountPaisa: t.amount, payerUserId: userId, status: 'INITIATED' } });
  try {
    const init = provider === 'ESEWA' ? esewa.initiate(reference, t.amount) : await khalti.initiate(reference, t.amount, t.name);
    if (init.providerRef) await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: init.providerRef, status: 'PENDING' } });
    return { paymentId: payment.id, reference, redirect: init.redirect };
  } catch (e) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'INITIATION_FAILED' } });
    throw new HttpError(502, 'Could not start payment with the gateway. Please try again.', 'GATEWAY_ERROR');
  }
}

/** Re-verifies with the gateway (never trusts the browser) and settles idempotently. */
export async function verifyAndSettle(reference: string) {
  const p = await prisma.payment.findUnique({ where: { reference } });
  if (!p) throw notFound('Payment');
  if (p.status === 'SUCCESS' || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED') return p;
  let v: VerifyResult;
  try {
    v = p.provider === 'ESEWA' ? await esewa.verify(reference, p.amountPaisa) : await khalti.verify(p.providerRef ?? '');
  } catch {
    return prisma.payment.update({ where: { id: p.id }, data: { status: 'PENDING', failureReason: 'VERIFY_TIMEOUT' } });
  }
  return applyVerification(p.id, v);
}

export async function applyVerification(paymentId: string, v: VerifyResult) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (v.status === 'SUCCESS' && v.amountPaisa != null && v.amountPaisa !== p.amountPaisa) {
    await audit(null, 'PAYMENT_AMOUNT_MISMATCH', 'Payment', p.id);
    return prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED', failureReason: 'AMOUNT_MISMATCH', rawVerification: v.raw as Prisma.InputJsonValue } });
  }
  if (v.status !== 'SUCCESS')
    return prisma.payment.update({ where: { id: p.id }, data: { status: v.status === 'PENDING' ? 'PENDING' : 'FAILED', failureReason: v.status === 'FAILED' ? 'GATEWAY_DECLINED' : null, rawVerification: v.raw as Prisma.InputJsonValue } });

  // Idempotent settle: only one caller can move a non-success payment to SUCCESS.
  const won = await prisma.payment.updateMany({
    where: { id: p.id, status: { in: ['INITIATED', 'PENDING', 'FAILED'] } },
    data: { status: 'SUCCESS', transactionId: v.transactionId, verifiedAt: new Date(), rawVerification: v.raw as Prisma.InputJsonValue, failureReason: null },
  });
  if (!won.count) return prisma.payment.findUniqueOrThrow({ where: { id: p.id } });

  if (p.appointmentId) {
    const moved = await prisma.appointment.updateMany({ where: { id: p.appointmentId, status: 'PENDING_PAYMENT' }, data: { status: 'PENDING_COUNSELOR' } });
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: p.appointmentId }, include: { counselor: true, youth: true } });
    if (moved.count) {
      await notify(a.counselor.userId, { type: 'BOOKING_REQUEST', title: 'New booking request', body: 'A new session request is waiting for your response.', key: `booking-request:${a.id}` });
      await notify(a.youth.userId, { type: 'PAYMENT_RESULT', title: 'Payment confirmed', body: 'Your payment was verified. Your counselor will respond soon.', key: `payment-ok:${p.id}` });
    } else {
      // Appointment expired/cancelled while paying → automatic full refund request.
      await prisma.refund.create({ data: { paymentId: p.id, amountPaisa: p.amountPaisa, reason: 'Payment completed after the booking was no longer available' } });
      await notify(a.youth.userId, { type: 'REFUND', title: 'Refund requested', body: 'Your booking was no longer available, so a full refund has been requested.', key: `late-payment-refund:${p.id}` });
    }
  }
  if (p.programBookingId) {
    const moved = await prisma.programBooking.updateMany({ where: { id: p.programBookingId, status: 'PENDING_PAYMENT' }, data: { status: 'CONFIRMED' } });
    if (moved.count)
      await notify(p.payerUserId, { type: 'PROGRAM_BOOKING', title: 'Program booking confirmed', body: 'Your payment was verified and your place is confirmed.', key: `program-paid:${p.id}` });
    else await prisma.refund.create({ data: { paymentId: p.id, amountPaisa: p.amountPaisa, reason: 'Booking no longer pending payment' } });
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
}

/** Creates a refund request according to the configurable policy. */
export async function requestAppointmentRefund(appointmentId: string, cancelledBy: 'YOUTH' | 'COUNSELOR', actorId: string) {
  const a = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { payments: { where: { status: 'SUCCESS' } } } });
  const paid = a.payments[0];
  if (!paid) return null;
  const policy = await getSetting('refund.policy');
  const amount = calculateRefund(paid.amountPaisa, a.startsAt, new Date(), cancelledBy, policy);
  if (amount <= 0) return null;
  return prisma.refund.create({ data: { paymentId: paid.id, amountPaisa: amount, reason: cancelledBy === 'COUNSELOR' ? 'Counselor cancelled or declined' : 'Cancelled by youth', requestedBy: actorId } });
}

/**
 * eSewa and Khalti do not expose a public merchant refund API for these checkout flows; refunds are executed in the
 * merchant portal. An admin records completion only after the gateway confirms, with the gateway reference.
 */
export async function completeRefund(refundId: string, adminId: string, gatewayRef: string) {
  const rf = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: { include: { refunds: true } } } });
  if (!rf) throw notFound('Refund');
  if (rf.status === 'COMPLETED') return rf;
  const done = await prisma.$transaction(async (tx) => {
    const updated = await tx.refund.update({ where: { id: rf.id }, data: { status: 'COMPLETED', gatewayRef, completedAt: new Date(), processedBy: adminId } });
    const refunded = rf.payment.refunds.filter((x) => x.status === 'COMPLETED' && x.id !== rf.id).reduce((s, x) => s + x.amountPaisa, 0) + rf.amountPaisa;
    await tx.payment.update({ where: { id: rf.paymentId }, data: { status: refunded >= rf.payment.amountPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    return updated;
  });
  await audit(adminId, 'REFUND_COMPLETED', 'Refund', rf.id);
  await notify(rf.payment.payerUserId, { type: 'REFUND', title: 'Refund completed', body: 'Your refund has been processed by the payment provider.', key: `refund-done:${rf.id}` });
  return done;
}
