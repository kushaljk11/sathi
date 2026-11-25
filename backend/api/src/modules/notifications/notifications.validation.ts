import { z } from 'zod';
import { pageQuery } from '../../utils/pagination.util';

export const listNotificationsQuery = pageQuery.extend({ unread: z.enum(['true', 'false']).optional() });
