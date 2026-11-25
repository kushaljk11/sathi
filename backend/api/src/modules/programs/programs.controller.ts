import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './programs.service';
import type { FeedbackInput, IdParams, ListProgramsQuery } from './programs.types';

export const listPrograms = asyncHandler(async (req, res) => {
  ok(res, await service.listPrograms(req.query as unknown as ListProgramsQuery));
});

export const listServices = asyncHandler(async (_req, res) => {
  ok(res, await service.listServices());
});

export const listCategories = asyncHandler(async (_req, res) => {
  ok(res, await service.listCategories());
});

export const myBookings = asyncHandler(async (req, res) => {
  ok(res, await service.myBookings(req.user!.id));
});

export const getProgram = asyncHandler(async (req, res) => {
  ok(res, await service.getProgram((req.params as IdParams).id));
});

export const book = asyncHandler(async (req, res) => {
  ok(res, await service.bookProgramAndNotify(req.user!.id, (req.params as IdParams).id), 201);
});

export const save = asyncHandler(async (req, res) => {
  ok(res, await service.saveProgram(req.user!.id, (req.params as IdParams).id));
});

export const leaveWaitlist = asyncHandler(async (req, res) => {
  ok(res, await service.leaveWaitlist(req.user!.id, (req.params as IdParams).id));
});

export const cancelBooking = asyncHandler(async (req, res) => {
  ok(res, await service.cancelProgramBooking((req.params as IdParams).id, { userId: req.user!.id }));
});

export const submitFeedback = asyncHandler(async (req, res) => {
  ok(res, await service.submitFeedback(req.user!.id, (req.params as IdParams).id, req.body as FeedbackInput), 201);
});
