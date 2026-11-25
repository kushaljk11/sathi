import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './safety.service';
import type { ScreeningInput } from './safety.types';

export const listQuestions = asyncHandler(async (_req, res) => {
  ok(res, await service.listQuestions());
});

export const listResources = asyncHandler(async (_req, res) => {
  ok(res, await service.listResources());
});

export const createScreening = asyncHandler(async (req, res) => {
  ok(res, await service.createScreening(req.user!.id, (req.body as ScreeningInput).answers), 201);
});
