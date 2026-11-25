import type { z } from 'zod';
import type { MILESTONES } from './support.constants';
import type { updateRelationshipStatusSchema, createNoteSchema } from './support.validation';

export type MilestoneKind = keyof typeof MILESTONES;
export type UpdateRelationshipStatusInput = z.infer<typeof updateRelationshipStatusSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export interface RelationshipAccessOptions {
  activeOnly?: boolean;
  counselorOnly?: boolean;
}
