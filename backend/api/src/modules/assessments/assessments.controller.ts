import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './assessments.service';
import type { AssessmentAnswersInput, SaveDraftInput } from './assessments.types';

export const listQuestions = asyncHandler(async (_req, res) => {
  ok(res, await service.listQuestions());
});

export const startOrResume = asyncHandler(async (req, res) => {
  ok(res, await service.startOrResume(req.user!.id));
});

export const saveDraft = asyncHandler(async (req, res) => {
  ok(res, await service.saveDraft(req.user!.id, String(req.params.id), (req.body as SaveDraftInput).draft));
});

export const submit = asyncHandler(async (req, res) => {
  ok(res, await service.submit(req.user!.id, String(req.params.id), req.body), 201);
});

export const history = asyncHandler(async (req, res) => {
  ok(res, await service.history(req.user!.id));
});

export const getNeedProfile = asyncHandler(async (req, res) => {
  ok(res, await service.latestNeedProfile(req.user!.id));
});

export const updateNeedProfile = asyncHandler(async (req, res) => {
  ok(res, await service.updateNeedProfile(req.user!.id, req.body as AssessmentAnswersInput), 201);
});
