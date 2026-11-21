import { describe, it, expect } from 'vitest';
import {
  rankProviders, validateWeights, DEFAULT_WEIGHTS, hardFilter, calculateRefund, canTransition,
  evaluateConsent, programSeatOutcome, taskCompletionRate, type NeedProfile, type Provider,
} from '../src';

const need: NeedProfile = {
  concerns: ['anxiety', 'stress'], desiredSupport: ['counseling'], languages: ['ne', 'en'],
  mode: 'ONLINE', ageGroup: '18-24', availability: [{ day: 1, startMin: 600, endMin: 720 }],
};
const base: Provider = {
  id: 'a', name: 'A', verified: true, suspended: false, acceptingBookings: true,
  supportedConcerns: ['anxiety', 'stress'], specializations: ['anxiety', 'stress'], languages: ['ne'],
  ageGroups: ['18-24'], mode: 'BOTH', availability: [{ day: 1, startMin: 540, endMin: 1020 }], hasOpenSlots: true,
};

describe('matching', () => {
  it('default weights sum to 100', () => expect(validateWeights(DEFAULT_WEIGHTS)).toBe(true));
  it('rejects invalid weights', () =>
    expect(() => rankProviders(need, [], { ...DEFAULT_WEIGHTS, mode: 20 })).toThrow());
  it('hard filters', () => {
    expect(hardFilter(need, { ...base, verified: false })).toBe('Not verified');
    expect(hardFilter(need, { ...base, suspended: true })).toBe('Suspended');
    expect(hardFilter(need, { ...base, mode: 'IN_PERSON' })).toBe('Delivery mode unavailable');
    expect(hardFilter(need, { ...base, hasOpenSlots: false })).toBe('No open availability');
    expect(hardFilter(need, base)).toBeNull();
  });
  it('ranks with explainable breakdown', () => {
    const { results } = rankProviders(need, [{ ...base, id: 'b', languages: ['en'], specializations: [] }, base]);
    expect(results[0].providerId).toBe('a');
    expect(results[0].total).toBe(98); // location 80 (no coords, online)
    expect(results[0].factors.reduce((s, f) => s + f.weight, 0)).toBe(100);
    expect(results[1].gaps.length).toBeGreaterThan(0);
  });
  it('distant provider kept when online accepted', () => {
    const r = rankProviders({ ...need, lat: 27.7, lng: 85.3 }, [{ ...base, lat: 28.2, lng: 83.98 }]);
    expect(r.results).toHaveLength(1);
  });
});

describe('refunds', () => {
  const appt = new Date('2026-01-10T10:00:00Z');
  it('full >24h', () => expect(calculateRefund(100000, appt, new Date('2026-01-09T09:00:00Z'), 'YOUTH')).toBe(100000));
  it('50% 2-24h', () => expect(calculateRefund(100000, appt, new Date('2026-01-10T05:00:00Z'), 'YOUTH')).toBe(50000));
  it('none <2h', () => expect(calculateRefund(100000, appt, new Date('2026-01-10T09:00:00Z'), 'YOUTH')).toBe(0));
  it('counselor cancel = full', () =>
    expect(calculateRefund(100000, appt, new Date('2026-01-10T09:59:00Z'), 'COUNSELOR')).toBe(100000));
});

describe('booking, capacity, consent', () => {
  it('transitions', () => {
    expect(canTransition('PENDING_PAYMENT', 'PENDING_COUNSELOR')).toBe(true);
    expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
  });
  it('capacity', () => {
    expect(programSeatOutcome(2, 1)).toBe('CONFIRMED');
    expect(programSeatOutcome(2, 2)).toBe('WAITLISTED');
  });
  it('task rate distinguishes missing data', () => {
    expect(taskCompletionRate([])).toBeNull();
    expect(taskCompletionRate(['COMPLETED', 'PENDING'])).toBe(50);
  });
  const ok = {
    accessorRole: 'COUNSELOR', recipientId: 'r', relationshipActive: true, category: 'CHECKIN_TRENDS' as const,
    consent: { recipientId: 'r', category: 'CHECKIN_TRENDS' as const, granted: true, withdrawnAt: null },
  };
  it('consent allowed', () => expect(evaluateConsent(ok).allowed).toBe(true));
  it('withdrawn denied', () =>
    expect(evaluateConsent({ ...ok, consent: { ...ok.consent, withdrawnAt: new Date() } }).allowed).toBe(false));
  it('wrong recipient denied', () => expect(evaluateConsent({ ...ok, recipientId: 'x' }).allowed).toBe(false));
  it('inactive relationship denied', () =>
    expect(evaluateConsent({ ...ok, relationshipActive: false }).allowed).toBe(false));
});
