import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './support.service';
import type { CreateNoteInput, UpdateRelationshipStatusInput } from './support.types';

export const listRelationships = asyncHandler(async (req, res) => {
  ok(res, await service.listRelationships(req.user!));
});

export const getRelationship = asyncHandler(async (req, res) => {
  ok(res, await service.getRelationship(req.params.id as string, req.user!));
});

export const updateRelationshipStatus = asyncHandler(async (req, res) => {
  ok(res, await service.updateRelationshipStatus(req.params.id as string, req.user!, req.body as UpdateRelationshipStatusInput));
});

export const listNotes = asyncHandler(async (req, res) => {
  ok(res, await service.listNotes(req.params.id as string, req.user!));
});

export const createNote = asyncHandler(async (req, res) => {
  ok(res, await service.createNote(req.params.id as string, req.user!, (req.body as CreateNoteInput).body), 201);
});

export const getSharedProfile = asyncHandler(async (req, res) => {
  ok(res, await service.getSharedProfile(req.params.id as string, req.user!));
});
