import { describe, it, expect } from 'vitest';
import { classifyText, decideModeration, validateThresholds, DEFAULT_MOD_THRESHOLDS, canMeetingTransition, canJoin, needsOnlineMeeting, whatChanged } from '../src';

const outcome = (t: string, ctx = {}) => decideModeration(classifyText(t, ctx)).outcome;

describe('moderation — safe content and false positives', () => {
  it.each([
    'I disagree with this approach, I think sleep matters more.',
    'You are wrong about that, but I see your point.',
    'This exam system is stupid and stressful.',
    'I felt really sad and angry today, it was a hard week.',
    'मलाई आज धेरै तनाव भयो, तर साथीहरूसँग कुरा गर्दा राम्रो लाग्यो।',
    'Ma timro kura sanga sahamat chhaina, tara thik cha.',
    'Check the resource at https://who.int for more info.',
  ])('approves: %s', (t) => expect(outcome(t)).toBe('APPROVED'));
});

describe('moderation — harmful content', () => {
  it('spam advert with many links is rejected', () =>
    expect(outcome('BUY NOW cheap followers http://a.com http://b.com http://c.com http://d.com http://e.com')).toBe('REJECTED'));
  it('shortened link rejected as malicious', () => expect(outcome('great tips here bit.ly/abc http://bit.ly/x')).toBe('REJECTED'));
  it('duplicate content rejected', () => expect(outcome('hello everyone', { duplicateOfRecent: true })).toBe('REJECTED'));
  it('flooding is rejected', () => expect(outcome('hi again', { postsLastHour: 12 })).toBe('REJECTED'));
  it('targeted insult (EN) is hidden', () => expect(outcome('You are such a worthless loser')).toBe('HIDDEN'));
  it('targeted insult (NE Devanagari) is held or hidden', () => expect(['FLAGGED', 'HIDDEN']).toContain(outcome('तिमी एकदम मुर्ख हौ')));
  it('targeted insult (romanised NE) is held or hidden', () => expect(['FLAGGED', 'HIDDEN']).toContain(outcome('timi ekdam murkha hau')));
  it('harassment hidden', () => expect(outcome('nobody likes you, just go away')).toBe('HIDDEN'));
  it('hate hidden', () => expect(outcome('go back to your country')).toBe('HIDDEN'));
  it('threat hidden and escalated', () => {
    const d = decideModeration(classifyText("I'm going to find you, watch your back"));
    expect(d.outcome).toBe('HIDDEN');
    expect(d.safetyEscalated).toBe(true);
  });
  it('NE threat escalated', () => expect(decideModeration(classifyText('तँलाई मार्छु')).safetyEscalated).toBe(true));
  it('self-harm content held with safety escalation and supportive message', () => {
    const d = decideModeration(classifyText('I want to die, there is no reason to live'));
    expect(d.outcome).toBe('FLAGGED');
    expect(d.safetyEscalated).toBe(true);
    expect(d.userMessage).toMatch(/urgent help/);
  });
  it('NE self-harm escalated', () => expect(decideModeration(classifyText('मलाई मर्न मन छ')).safetyEscalated).toBe(true));
  it('phone number exposure held', () => expect(outcome('call her on 9812345678')).toBe('FLAGGED'));
  it('unsupported script routed to human review', () => {
    const d = decideModeration(classifyText('Это очень плохой комментарий о человеке'));
    expect(d.outcome).toBe('FLAGGED');
    expect(d.needsHumanReview).toBe(true);
  });
  it('threshold validation', () => {
    expect(validateThresholds(DEFAULT_MOD_THRESHOLDS)).toBe(true);
    expect(validateThresholds({ hold: 0.9, hide: 0.5, reject: 0.95 })).toBe(false);
  });
  it('stricter thresholds hold more content', () =>
    expect(decideModeration(classifyText('call her on 9812345678'), { hold: 0.3, hide: 0.6, reject: 0.9 }).outcome).toBe('HIDDEN'));
});

describe('meeting lifecycle', () => {
  it('transitions', () => {
    expect(canMeetingTransition('PENDING', 'CREATING')).toBe(true);
    expect(canMeetingTransition('FAILED', 'CREATING')).toBe(true);
    expect(canMeetingTransition('CANCELLED', 'READY')).toBe(false);
  });
  it('only confirmed online appointments need meetings', () => {
    expect(needsOnlineMeeting('CONFIRMED', 'ONLINE')).toBe(true);
    expect(needsOnlineMeeting('CONFIRMED', 'IN_PERSON')).toBe(false);
    expect(needsOnlineMeeting('PENDING_COUNSELOR', 'ONLINE')).toBe(false);
  });
  it('join only for participants when ready', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const base = { status: 'READY' as const, startTime: new Date('2026-01-01T10:30:00Z'), endTime: new Date('2026-01-01T11:30:00Z'), now };
    expect(canJoin({ ...base, isParticipant: true })).toBe(true);
    expect(canJoin({ ...base, isParticipant: false })).toBe(false);
    expect(canJoin({ ...base, isParticipant: true, status: 'FAILED' })).toBe(false);
  });
});

describe('progress', () => {
  it('distinguishes missing data from change', () => {
    const row = { mood: 3, stress: 6, sleep: 3, energy: 3, social: 3, functioning: 3, createdAt: new Date() };
    const r = whatChanged([row, { ...row, mood: 5 }], []);
    expect(r.find((x) => x.metric === 'mood')).toMatchObject({ current: 4, previous: null, change: null });
    expect(whatChanged([row], [{ ...row, stress: 8 }]).find((x) => x.metric === 'stress')!.change).toBe(-2);
  });
});
