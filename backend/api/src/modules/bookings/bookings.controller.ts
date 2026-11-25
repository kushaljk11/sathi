import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './bookings.service';
import type { CancelBookingInput, CreateBookingInput, DecisionInput, HoldSlotInput, ListBookingsQuery, OutcomeInput, RescheduleInput } from './bookings.types';

export const holdSlot = asyncHandler(async (req, res) => {
  const { slotId } = req.body as HoldSlotInput;
  ok(res, await service.holdSlot(req.user!.id, slotId), 201);
});

export const releaseHold = asyncHandler(async (req, res) => {
  ok(res, await service.releaseHold(req.user!.id, String(req.params.id)));
});

export const createBooking = asyncHandler(async (req, res) => {
  ok(res, await service.createBooking(req.user!.id, req.body as CreateBookingInput), 201);
});

export const listAppointments = asyncHandler(async (req, res) => {
  ok(res, await service.listAppointments(req.user!, req.query as unknown as ListBookingsQuery));
});

export const decide = asyncHandler(async (req, res) => {
  ok(res, await service.decideBooking(req.user!.id, String(req.params.id), req.body as DecisionInput));
});

export const cancel = asyncHandler(async (req, res) => {
  const { reason } = req.body as CancelBookingInput;
  ok(res, await service.cancelBooking(req.user!.id, String(req.params.id), reason));
});

export const reschedule = asyncHandler(async (req, res) => {
  const { holdId } = req.body as RescheduleInput;
  ok(res, await service.rescheduleBooking(req.user!.id, String(req.params.id), holdId));
});

export const outcome = asyncHandler(async (req, res) => {
  ok(res, await service.recordOutcome(req.user!.id, String(req.params.id), req.body as OutcomeInput));
});
