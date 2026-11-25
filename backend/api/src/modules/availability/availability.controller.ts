import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './availability.service';
import type { ExceptionInput, GenerateSlotsInput, ReplaceAvailabilityInput } from './availability.types';

export const getAvailability = asyncHandler(async (req, res) => {
  ok(res, await service.getAvailability(req.user!.id));
});

export const replaceAvailability = asyncHandler(async (req, res) => {
  ok(res, await service.replaceAvailability(req.user!.id, req.body as ReplaceAvailabilityInput));
});

export const addException = asyncHandler(async (req, res) => {
  ok(res, await service.addException(req.user!.id, req.body as ExceptionInput), 201);
});

export const removeException = asyncHandler(async (req, res) => {
  ok(res, await service.removeException(req.user!.id, String(req.params.id)));
});

export const generateSlots = asyncHandler(async (req, res) => {
  ok(res, await service.generateMySlots(req.user!.id, (req.body as GenerateSlotsInput).days));
});

export const listSlots = asyncHandler(async (req, res) => {
  ok(res, await service.listMySlots(req.user!.id));
});

export const removeSlot = asyncHandler(async (req, res) => {
  ok(res, await service.removeSlot(req.user!.id, String(req.params.id)));
});
