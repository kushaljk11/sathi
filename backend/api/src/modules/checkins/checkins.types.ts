import type { z } from 'zod';
import type { CheckInInput } from '@sathi/shared';
import type { listCheckInsQuery } from './checkins.validation';

export type { CheckInInput };
export type ListCheckInsQuery = z.infer<typeof listCheckInsQuery>;
