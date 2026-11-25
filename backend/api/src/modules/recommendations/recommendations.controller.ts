import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './recommendations.service';
import type { CreateRecommendationInput, RankQuery, RecommendationIdParams, RelationshipIdParams, RespondInput } from './recommendations.types';

export const myRecommendations = asyncHandler(async (req, res) => {
  ok(res, await service.myRecommendations(req.user!.id));
});

export const respond = asyncHandler(async (req, res) => {
  ok(res, await service.respondToRecommendation(req.user!.id, (req.params as RecommendationIdParams).id, (req.body as RespondInput).action));
});

export const rankForRelationship = asyncHandler(async (req, res) => {
  ok(res, await service.rankForRelationship(req.user!, (req.params as RelationshipIdParams).relationshipId, req.query as unknown as RankQuery));
});

export const create = asyncHandler(async (req, res) => {
  ok(res, await service.createRecommendation(req.user!, req.body as CreateRecommendationInput), 201);
});

export const sent = asyncHandler(async (req, res) => {
  ok(res, await service.sentRecommendations(req.user!, (req.params as RelationshipIdParams).relationshipId));
});
