import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './matching.service';
import type { MatchingConfigInput } from './matching.types';

export const run = asyncHandler(async (req, res) => {
  ok(res, await service.runMatching(req.user!.id));
});

export const latestRun = asyncHandler(async (req, res) => {
  ok(res, await service.latestRun(req.user!.id));
});

export const listConfigs = asyncHandler(async (_req, res) => {
  ok(res, await service.listConfigs());
});

export const createConfig = asyncHandler(async (req, res) => {
  ok(res, await service.createConfig(req.user!.id, req.body as MatchingConfigInput), 201);
});
