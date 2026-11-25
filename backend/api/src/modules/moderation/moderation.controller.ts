import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './moderation.service';
import type { CaseActionInput, QueueQuery } from './moderation.types';

export const queue = asyncHandler(async (req, res) => {
  ok(res, await service.listQueue(req.query as unknown as QueueQuery));
});

export const getCase = asyncHandler(async (req, res) => {
  ok(res, await service.getCase(String(req.params.id)));
});

export const applyAction = asyncHandler(async (req, res) => {
  ok(res, await service.applyAction(req.user!.id, String(req.params.id), req.body as CaseActionInput));
});
