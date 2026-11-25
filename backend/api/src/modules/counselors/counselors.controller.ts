import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './counselors.service';
import type { DirectoryQuery, SlotsQuery } from './counselors.types';

export const list = asyncHandler(async (req, res) => {
  ok(res, await service.listCounselors(req.query as unknown as DirectoryQuery));
});

export const getById = asyncHandler(async (req, res) => {
  ok(res, await service.getCounselor(String(req.params.id)));
});

export const slots = asyncHandler(async (req, res) => {
  ok(res, await service.listBookableSlots(String(req.params.id), req.query as unknown as SlotsQuery));
});
