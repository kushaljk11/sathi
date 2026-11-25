import type { z } from 'zod';
import type { listNotificationsQuery } from './notifications.validation';

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;
