import { prisma } from '../../config/database';
import { notFound } from '../../core/errors/app.error';
import { paged } from '../../utils/pagination.util';
import type { ListResourcesQuery } from './resources.types';

export async function listResources(q: ListResourcesQuery) {
  const where = {
    status: 'PUBLISHED' as const,
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.language ? { language: q.language } : {}),
    ...(q.contentType ? { contentType: q.contentType } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' as const } }, { body: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
  };
  const [items, total, categories] = await Promise.all([
    prisma.resource.findMany({ where, include: { category: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.resource.count({ where }),
    prisma.resourceCategory.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { ...paged(items, total, q.page, q.pageSize), categories };
}

export async function getResource(id: string) {
  const resource = await prisma.resource.findFirst({ where: { id, status: 'PUBLISHED' }, include: { category: true } });
  if (!resource) throw notFound('Resource');
  return resource;
}
