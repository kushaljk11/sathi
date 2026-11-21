/** Explainable two-stage matching engine. Pure functions — no I/O. */
export type Mode = 'ONLINE' | 'IN_PERSON' | 'BOTH';
export interface TimeWindow { day: number; startMin: number; endMin: number }
export interface NeedProfile {
  concerns: string[]; desiredSupport: string[]; languages: string[]; mode: Mode;
  ageGroup?: string; lat?: number; lng?: number; maxTravelKm?: number; availability: TimeWindow[];
}
export interface Provider {
  id: string; name: string; verified: boolean; suspended: boolean; acceptingBookings: boolean;
  supportedConcerns: string[]; specializations: string[]; languages: string[]; ageGroups: string[];
  mode: Mode; lat?: number; lng?: number; availability: TimeWindow[]; hasOpenSlots: boolean;
}
export type Factor = 'concern' | 'specialization' | 'language' | 'availability' | 'location' | 'mode';
export type Weights = Record<Factor, number>;
export const DEFAULT_WEIGHTS: Weights = {
  concern: 30, specialization: 20, language: 15, availability: 15, location: 10, mode: 10,
};

export function validateWeights(w: Weights): boolean {
  const vals = Object.values(w);
  return vals.every((v) => v >= 0) && Math.abs(vals.reduce((a, b) => a + b, 0) - 100) < 1e-9;
}

const overlap = (a: string[], b: string[]) => {
  const B = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => B.has(x.toLowerCase()));
};

export const supportsMode = (provider: Mode, wanted: Mode) =>
  wanted === 'BOTH' || provider === 'BOTH' || provider === wanted;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Stage 1: returns null if eligible, else the exclusion reason. */
export function hardFilter(n: NeedProfile, p: Provider): string | null {
  if (!p.verified) return 'Not verified';
  if (p.suspended) return 'Suspended';
  if (!p.acceptingBookings) return 'Not accepting bookings';
  if (n.ageGroup && p.ageGroups.length && !p.ageGroups.includes(n.ageGroup)) return 'Age group not served';
  if (!supportsMode(p.mode, n.mode)) return 'Delivery mode unavailable';
  if (!p.hasOpenSlots || p.availability.length === 0) return 'No open availability';
  if (overlap(n.concerns, p.supportedConcerns).length === 0) return 'Concern not supported';
  return null;
}

export const scoreConcern = (n: NeedProfile, p: Provider) =>
  n.concerns.length ? (overlap(n.concerns, p.supportedConcerns).length / n.concerns.length) * 100 : 100;

export const scoreSpecialization = (n: NeedProfile, p: Provider) =>
  n.concerns.length
    ? Math.min(100, (overlap(n.concerns, p.specializations).length / n.concerns.length) * 100)
    : 100;

export const scoreLanguage = (n: NeedProfile, p: Provider) => {
  if (!n.languages.length) return 100;
  const m = overlap(n.languages, p.languages).map((x) => x.toLowerCase());
  if (!m.length) return 0;
  return m.includes(n.languages[0].toLowerCase()) ? 100 : 70;
};

export const scoreAvailability = (n: NeedProfile, p: Provider) => {
  const wanted = n.availability.reduce((s, w) => s + (w.endMin - w.startMin), 0);
  if (!wanted) return 100;
  let ov = 0;
  for (const a of n.availability)
    for (const b of p.availability)
      if (a.day === b.day)
        ov += Math.max(0, Math.min(a.endMin, b.endMin) - Math.max(a.startMin, b.startMin));
  return Math.min(100, (ov / wanted) * 100);
};

/** Distance only matters for in-person; online-capable pairs are never penalised below 80. */
export const scoreLocation = (n: NeedProfile, p: Provider) => {
  const onlineOk = n.mode !== 'IN_PERSON' && p.mode !== 'IN_PERSON';
  if (n.lat == null || n.lng == null || p.lat == null || p.lng == null) return onlineOk ? 80 : 50;
  const d = haversineKm(n.lat, n.lng, p.lat, p.lng);
  const max = n.maxTravelKm ?? 15;
  const inPerson = d <= max ? 100 : Math.max(0, 100 - ((d - max) / max) * 100);
  return onlineOk ? Math.max(inPerson, 80) : inPerson;
};

export const scoreMode = (n: NeedProfile, p: Provider) =>
  n.mode === p.mode || p.mode === 'BOTH' ? 100 : n.mode === 'BOTH' ? 70 : 0;

export const FACTORS: Record<Factor, (n: NeedProfile, p: Provider) => number> = {
  concern: scoreConcern,
  specialization: scoreSpecialization,
  language: scoreLanguage,
  availability: scoreAvailability,
  location: scoreLocation,
  mode: scoreMode,
};

const LABEL: Record<Factor, string> = {
  concern: 'the concerns you shared',
  specialization: 'specialization',
  language: 'language',
  availability: 'availability',
  location: 'location',
  mode: 'session format',
};

export interface FactorResult { factor: Factor; score: number; weight: number; weighted: number }
export interface MatchResult {
  providerId: string; name: string; total: number; factors: FactorResult[];
  explanations: string[]; gaps: string[];
}

export function scoreProvider(n: NeedProfile, p: Provider, w: Weights = DEFAULT_WEIGHTS): MatchResult {
  const factors = (Object.keys(FACTORS) as Factor[]).map((f) => {
    const score = Math.round(FACTORS[f](n, p));
    return { factor: f, score, weight: w[f], weighted: Math.round(w[f] * score) / 100 };
  });
  const total = Math.round(factors.reduce((s, f) => s + f.weighted, 0));
  const fmt = (f: FactorResult) => `${LABEL[f.factor]} (${Math.round(f.weighted)}/${f.weight})`;
  return {
    providerId: p.id,
    name: p.name,
    total,
    factors,
    explanations: factors.filter((f) => f.score >= 80).map((f) => `Strong match on ${fmt(f)}`),
    gaps: factors.filter((f) => f.score < 60).map((f) => `Partial match on ${fmt(f)}`),
  };
}

export function rankProviders(n: NeedProfile, providers: Provider[], w: Weights = DEFAULT_WEIGHTS) {
  if (!validateWeights(w)) throw new Error('Weights must sum to 100');
  const excluded: { providerId: string; reason: string }[] = [];
  const results: MatchResult[] = [];
  for (const p of providers) {
    const reason = hardFilter(n, p);
    if (reason) excluded.push({ providerId: p.id, reason });
    else results.push(scoreProvider(n, p, w));
  }
  results.sort((a, b) => b.total - a.total);
  return { results, excluded };
}
