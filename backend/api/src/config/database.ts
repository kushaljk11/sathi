import { PrismaClient, type Prisma } from '@prisma/client';

/** Single shared Prisma client for the process. */
export const prisma = new PrismaClient();

/** Transaction client passed to `prisma.$transaction(async (tx) => ...)` callbacks. */
export type Tx = Prisma.TransactionClient;
