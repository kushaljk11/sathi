import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import { CATEGORIES } from './community.constants';
import * as service from './community.service';
import { editContentSchema } from './community.validation';
import type { AppealInput, BlockInput, ContentParams, CreateCommentInput, CreatePostInput, ListPostsQuery, ReactionInput, ReportInput } from './community.types';

export const categories = asyncHandler(async (_req, res) => {
  ok(res, CATEGORIES);
});

export const listPosts = asyncHandler(async (req, res) => {
  ok(res, await service.listPosts(req.user!.id, req.query as unknown as ListPostsQuery));
});

export const createPost = asyncHandler(async (req, res) => {
  ok(res, await service.createPost(req.user!.id, req.body as CreatePostInput), 201);
});

export const getPost = asyncHandler(async (req, res) => {
  ok(res, await service.getPost(req.user!.id, String(req.params.id)));
});

export const createComment = asyncHandler(async (req, res) => {
  ok(res, await service.createComment(req.user!.id, String(req.params.id), req.body as CreateCommentInput), 201);
});

export const editContent = asyncHandler(async (req, res) => {
  const { type, id } = req.params as unknown as ContentParams;
  const { body } = editContentSchema(type).parse(req.body);
  ok(res, await service.editContent(req.user!.id, type, id, body));
});

export const removeContent = asyncHandler(async (req, res) => {
  const { type, id } = req.params as unknown as ContentParams;
  ok(res, await service.removeContent(req.user!.id, type, id));
});

export const toggleReaction = asyncHandler(async (req, res) => {
  ok(res, await service.toggleReaction(req.user!.id, String(req.params.id), req.body as ReactionInput));
});

export const reportContent = asyncHandler(async (req, res) => {
  ok(res, await service.reportContent(req.user!.id, req.body as ReportInput), 201);
});

export const listBlocks = asyncHandler(async (req, res) => {
  ok(res, await service.listBlocks(req.user!.id));
});

export const blockAuthor = asyncHandler(async (req, res) => {
  ok(res, await service.blockAuthor(req.user!.id, req.body as BlockInput), 201);
});

export const unblock = asyncHandler(async (req, res) => {
  ok(res, await service.unblock(req.user!.id, String(req.params.id)));
});

export const myContent = asyncHandler(async (req, res) => {
  ok(res, await service.myContent(req.user!.id));
});

export const submitAppeal = asyncHandler(async (req, res) => {
  ok(res, await service.submitAppeal(req.user!.id, req.body as AppealInput), 201);
});
