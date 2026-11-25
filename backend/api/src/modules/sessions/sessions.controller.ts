import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './sessions.service';
import type { SessionRecordInput } from './sessions.types';

export const saveSessionRecord = asyncHandler(async (req, res) => {
  ok(res, await service.upsertSessionRecord(req.user!.id, String(req.params.id), req.body as SessionRecordInput));
});
