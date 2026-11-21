export type ConsentCategory =
  | 'ASSESSMENT_SUMMARY' | 'SUPPORT_NEED_PROFILE' | 'CHECKIN_TRENDS' | 'SUPPORT_HISTORY';

export interface ConsentInput {
  accessorRole: string;
  recipientId: string;
  relationshipActive: boolean;
  category: ConsentCategory;
  consent?: { recipientId: string; category: ConsentCategory; granted: boolean; withdrawnAt: Date | null } | null;
}

/** Deny-by-default consent evaluation for sensitive youth data. */
export function evaluateConsent(i: ConsentInput): { allowed: boolean; reason: string } {
  if (i.accessorRole !== 'COUNSELOR') return { allowed: false, reason: 'Role not permitted' };
  if (!i.relationshipActive) return { allowed: false, reason: 'No active support relationship' };
  const c = i.consent;
  if (!c || c.recipientId !== i.recipientId || c.category !== i.category)
    return { allowed: false, reason: 'No consent record' };
  if (!c.granted || c.withdrawnAt) return { allowed: false, reason: 'Consent not granted or withdrawn' };
  return { allowed: true, reason: 'Active consent' };
}
