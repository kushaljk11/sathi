import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './checkins.service';
import type { CheckInInput, ListCheckInsQuery } from './checkins.types';

export const createCheckIn = asyncHandler(async (req, res) => {
  ok(res, await service.createCheckIn(req.user!.id, req.body as CheckInInput), 201);
});

export const listCheckIns = asyncHandler(async (req, res) => {
  ok(res, await service.listCheckIns(req.user!.id, req.query as unknown as ListCheckInsQuery));
});
