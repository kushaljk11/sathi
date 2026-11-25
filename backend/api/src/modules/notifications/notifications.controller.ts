import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './notifications.service';
import type { ListNotificationsQuery } from './notifications.types';

export const listNotifications = asyncHandler(async (req, res) => {
  ok(res, await service.listNotifications(req.user!.id, req.query as unknown as ListNotificationsQuery));
});

export const markRead = asyncHandler(async (req, res) => {
  ok(res, await service.markRead(req.user!.id, String(req.params.id)));
});

export const markAllRead = asyncHandler(async (req, res) => {
  ok(res, await service.markAllRead(req.user!.id));
});
