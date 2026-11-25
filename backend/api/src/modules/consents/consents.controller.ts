import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './consents.service';
import type { UpdateConsentsInput } from './consents.types';

export const descriptions = (_req: Request, res: Response) => {
  ok(res, service.CONSENT_DESCRIPTIONS);
};

export const list = asyncHandler(async (req, res) => {
  ok(res, await service.listConsents(req.user!.id));
});

export const update = asyncHandler(async (req, res) => {
  ok(res, await service.updateConsents(req.user!.id, req.body as UpdateConsentsInput));
});

export const accessLog = asyncHandler(async (req, res) => {
  ok(res, await service.accessLog(req.user!.id));
});
