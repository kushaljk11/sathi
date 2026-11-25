import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './profiles.service';
import type { CounselorProfileInput, YouthProfileInput } from './profiles.types';

export const getYouthProfile = asyncHandler(async (req, res) => {
  ok(res, await service.getYouthProfile(req.user!.id));
});

export const updateYouthProfile = asyncHandler(async (req, res) => {
  ok(res, await service.updateYouthProfile(req.user!.id, req.body as YouthProfileInput));
});

export const getCounselorProfile = asyncHandler(async (req, res) => {
  ok(res, await service.getCounselorProfile(req.user!.id));
});

export const updateCounselorProfile = asyncHandler(async (req, res) => {
  ok(res, await service.updateCounselorProfile(req.user!.id, req.body as CounselorProfileInput));
});

export const uploadCounselorDocument = asyncHandler(async (req, res) => {
  ok(res, await service.addCounselorDocument(req.user!.id, req.file), 201);
});

export const submitCounselorVerification = asyncHandler(async (req, res) => {
  ok(res, await service.submitCounselorVerification(req.user!.id));
});

export const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await service.getDocumentFile(req.user!, String(req.params.id));
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(doc.content);
});
