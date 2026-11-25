import { io } from '../../sockets';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './chat.service';
import type { ListMessagesQuery, ReportMessageInput } from './chat.types';

export const listMessages = asyncHandler(async (req, res) => {
  ok(res, await service.listMessages(req.params.relationshipId as string, req.user!, req.query as unknown as ListMessagesQuery));
});

export const sendMessage = asyncHandler(async (req, res) => {
  const relationshipId = req.params.relationshipId as string;
  const message = await service.sendMessage(relationshipId, req.user!, req.body?.body);
  io?.to(`rel:${relationshipId}`).emit('message', message);
  ok(res, message, 201);
});

export const blockConversation = asyncHandler(async (req, res) => {
  ok(res, await service.setBlocked(req.params.relationshipId as string, req.user!, true));
});

export const unblockConversation = asyncHandler(async (req, res) => {
  ok(res, await service.setBlocked(req.params.relationshipId as string, req.user!, false));
});

export const reportMessage = asyncHandler(async (req, res) => {
  ok(res, await service.reportMessage(req.params.id as string, req.user!, req.body as ReportMessageInput), 201);
});
