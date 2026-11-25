import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './progress.service';
import type { CreateReviewInput, ProgressRangeQuery } from './progress.types';

export const getMyProgress = asyncHandler(async (req, res) => {
  ok(res, await service.getMyProgress(req.user!.id, req.query as unknown as ProgressRangeQuery));
});

export const getRelationshipProgress = asyncHandler(async (req, res) => {
  ok(res, await service.getRelationshipProgress(req.params.id as string, req.user!, req.query as unknown as ProgressRangeQuery));
});

export const createReview = asyncHandler(async (req, res) => {
  ok(res, await service.createReview(req.params.id as string, req.user!, req.body as CreateReviewInput), 201);
});
