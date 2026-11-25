import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './resources.service';
import type { ListResourcesQuery } from './resources.types';

export const listResources = asyncHandler(async (req, res) => {
  ok(res, await service.listResources(req.query as unknown as ListResourcesQuery));
});

export const getResource = asyncHandler(async (req, res) => {
  ok(res, await service.getResource(req.params.id as string));
});
