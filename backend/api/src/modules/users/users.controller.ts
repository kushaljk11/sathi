import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../../constants/app.constants';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './users.service';
import type { DeleteAccountInput, NotificationPreferencesInput, UpdateMeInput } from './users.types';

export const updateMe = asyncHandler(async (req, res) => {
  ok(res, await service.updateMe(req.user!.id, req.body as UpdateMeInput));
});

export const getNotificationPreferences = asyncHandler(async (req, res) => {
  ok(res, await service.getNotificationPreferences(req.user!.id));
});

export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  ok(res, await service.updateNotificationPreferences(req.user!.id, req.body as NotificationPreferencesInput));
});

export const exportData = asyncHandler(async (req, res) => {
  const data = await service.exportData(req.user!.id);
  res.setHeader('Content-Disposition', 'attachment; filename="sathi-export.json"');
  ok(res, data);
});

export const deleteAccount = asyncHandler(async (req, res) => {
  await service.deleteAccount(req.user!.id, (req.body as DeleteAccountInput).password);
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  ok(res, { deleted: true });
});
