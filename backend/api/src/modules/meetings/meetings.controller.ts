import { env } from '../../config/env';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './meetings.service';
import type { ManualLinkInput } from './meetings.types';
import { googleCallbackQuery } from './meetings.validation';

export const googleStatus = asyncHandler(async (req, res) => {
  ok(res, await service.googleStatus(req.user!.id));
});

export const googleConnect = asyncHandler(async (req, res) => {
  ok(res, await service.startGoogleConnect(req.user!.id));
});

export const googleCallback = asyncHandler(async (req, res) => {
  const back = (result: string) => res.redirect(`${env.FRONTEND_URL}/counselor/settings?google=${result}`);
  const query = googleCallbackQuery.safeParse(req.query);
  if (!query.success) return back('error');
  back(await service.completeGoogleConnect(query.data));
});

export const googleDisconnect = asyncHandler(async (req, res) => {
  ok(res, await service.disconnectGoogle(req.user!.id));
});

export const upcoming = asyncHandler(async (req, res) => {
  ok(res, await service.upcomingMeetings(req.user!));
});

export const forAppointment = asyncHandler(async (req, res) => {
  ok(res, await service.meetingForAppointment(String(req.params.id), req.user!.id));
});

export const retry = asyncHandler(async (req, res) => {
  ok(res, await service.retryMeeting(String(req.params.id), req.user!.id));
});

export const cancel = asyncHandler(async (req, res) => {
  ok(res, await service.cancelMeetingAsCounselor(String(req.params.id), req.user!.id));
});

export const setManualLink = asyncHandler(async (req, res) => {
  const { url } = req.body as ManualLinkInput;
  ok(res, await service.setManualDevLink(String(req.params.id), req.user!.id, url));
});
