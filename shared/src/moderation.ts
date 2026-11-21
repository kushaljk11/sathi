/**
 * Local rule-based moderation provider (English + Nepali, Devanagari and romanised).
 * Deterministic, explainable, no external dependency. Uncertain or unsupported-language
 * content is routed to human review instead of being auto-decided.
 * Lexicons are intentionally conservative and must be reviewed/extended by moderators.
 */
export type ModCategory =
  | 'spam' | 'malicious_link' | 'bullying' | 'harassment' | 'hate' | 'threat' | 'pii' | 'self_harm';
export type ModOutcome = 'APPROVED' | 'FLAGGED' | 'HIDDEN' | 'REJECTED';

export interface ModThresholds { hold: number; hide: number; reject: number }
export const DEFAULT_MOD_THRESHOLDS: ModThresholds = { hold: 0.5, hide: 0.85, reject: 0.9 };

export interface ModContext { duplicateOfRecent?: boolean; postsLastHour?: number; extraBlockedTerms?: string[] }
export interface ModResult {
  scores: Record<ModCategory, number>;
  maxScore: number;
  categories: ModCategory[];
  reasons: string[];
  uncertain: boolean;
  language: 'en' | 'ne' | 'mixed' | 'unknown';
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
const SHORTENER = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy)\b/i;
const SUSPICIOUS_URL = /(xn--|\/\/\d{1,3}(\.\d{1,3}){3}|\.(xyz|top|click|loan|win|zip|mov|ru)\b|@[^\s]*\/)/i;
const SPAM_PHRASES = [
  /\bbuy now\b/i, /\bclick (here|the link)\b/i, /\bfree money\b/i, /\bearn \$?\d+/i, /\bwork from home\b/i,
  /\bdm me for\b/i, /\bwhats ?app\s*\+?\d/i, /\bcrypto (giveaway|signals?)\b/i, /\blimited (time )?offer\b/i,
  /\bpromo code\b/i, /\bcheap (followers|likes)\b/i, /\bguaranteed (profit|returns)\b/i, /\bपैसा कमाउनुहोस्\b/,
];
const SECOND_PERSON = /\b(you|you're|youre|ur|u|your|yourself|timi|timro|ta|tero|tapai|tapaiko)\b|तिमी|तिम्रो|तँ|तेरो|तपाईं|@\w+/i;
const INSULTS = [
  /\b(idiot|stupid|loser|worthless|pathetic|dumb|moron|ugly|freak|retard(ed)?|disgusting|failure|trash)\b/i,
  /\b(murkha|gadha|badmash|bewakoof|pagal|kukur|lati)\b/i, /मुर्ख|गधा|बदमास|पागल|कुकुर|लाटा/,
];
const HARASSMENT = [
  /\b(nobody|no one) (likes|cares about|wants) (you|u)\b/i, /\beveryone hates (you|u)\b/i,
  /\b(shut up|get lost|go away),? (you|loser|idiot)\b/i, /\bkys\b/i, /\bkill yourself\b/i, /\bgo die\b/i,
  /तिमीलाई कसैले मन पराउँदैन/, /\bmar ja\b/i, /मरिजा|मर जा/,
];
const HATE = [
  /\bsub-?human\b/i, /\bgo back to (your|ur) (own )?country\b/i,
  /\b(all|those|these) \w+ (people )?(are|r) (animals|vermin|parasites|filth)\b/i,
  /\b\w+ (people|caste|community) should (die|be (removed|wiped out))\b/i,
];
const THREATS = [
  /\bi('ll| will|m going to|'m gonna| am going to) (kill|hurt|beat|stab|shoot|find) (you|u|him|her|them)\b/i,
  /\bwatch your back\b/i, /\bi know where (you|u) live\b/i, /\byou('ll| will) (regret|pay for) (this|it)\b/i,
  /मार्छु|कुट्छु|सिध्याइदिन्छु/, /\b(marchu|kutchu|sidhyaidinchu)\b/i,
];
const SELF_HARM = [
  /\b(kill|hurt|harm) myself\b/i, /\bend (my|it all|my life)\b/i, /\bwant to die\b/i, /\bsuicid(e|al)\b/i,
  /\bself[- ]?harm\b/i, /\bno reason to live\b/i, /मर्न मन (छ|लाग्छ)|आत्महत्या|बाँच्न मन छैन/, /\bmarna man (cha|lagcha)\b/i,
];
const PII = [
  /(\+977[-\s]?)?\b9[78]\d{8}\b/, /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, /\bmy (home )?address is\b/i,
  /\b(citizenship|passport) (no|number)\b/i,
];

const hits = (text: string, res: RegExp[]) => res.filter((r) => r.test(text)).length;

function detectLanguage(text: string): ModResult['language'] {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!letters) return 'en';
  const dev = (letters.match(/\p{Script=Devanagari}/gu) ?? []).length;
  const lat = (letters.match(/\p{Script=Latin}/gu) ?? []).length;
  const other = letters.length - dev - lat;
  if (other / letters.length > 0.3) return 'unknown';
  if (dev && lat) return 'mixed';
  return dev ? 'ne' : 'en';
}

export function classifyText(text: string, ctx: ModContext = {}): ModResult {
  const t = text.normalize('NFKC');
  const reasons: string[] = [];
  const s: Record<ModCategory, number> = { spam: 0, malicious_link: 0, bullying: 0, harassment: 0, hate: 0, threat: 0, pii: 0, self_harm: 0 };
  const bump = (c: ModCategory, v: number, why: string) => { if (v > s[c]) s[c] = Math.min(1, v); reasons.push(why); };

  // A. Deterministic spam signals
  const urls = t.match(URL_RE) ?? [];
  if (urls.length > 4) bump('spam', 0.92, 'Excessive links');
  else if (urls.length > 2) bump('spam', 0.6, 'Multiple links');
  if (urls.some((u) => SHORTENER.test(u) || SUSPICIOUS_URL.test(u))) bump('malicious_link', 0.9, 'Suspicious or shortened link');
  const spamHits = hits(t, SPAM_PHRASES);
  if (spamHits) bump('spam', Math.min(0.95, 0.55 + 0.2 * spamHits + (urls.length ? 0.15 : 0)), 'Advertising pattern');
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1));
  if (words.length >= 6 && Math.max(...freq.values()) / words.length > 0.5) bump('spam', 0.7, 'Repetitive text');
  if (/(.)\1{9,}/.test(t)) bump('spam', 0.55, 'Repeated characters');
  if (ctx.duplicateOfRecent) bump('spam', 0.9, 'Duplicate of recent content');
  if ((ctx.postsLastHour ?? 0) >= 10) bump('spam', 0.9, 'Unusual posting frequency');
  else if ((ctx.postsLastHour ?? 0) >= 6) bump('spam', 0.6, 'High posting frequency');

  // B. Text classification
  const targeted = SECOND_PERSON.test(t);
  const insultHits = hits(t, INSULTS);
  if (insultHits && targeted) bump('bullying', Math.min(0.95, 0.75 + 0.1 * insultHits), 'Insult directed at a person');
  else if (insultHits) bump('bullying', 0.25, 'Strong language (not targeted)');
  if (hits(t, HARASSMENT)) bump('harassment', 0.9, 'Harassing language');
  if (hits(t, HATE)) bump('hate', 0.9, 'Hateful generalisation');
  if (hits(t, THREATS)) bump('threat', 0.95, 'Threatening language');
  if (hits(t, SELF_HARM)) bump('self_harm', 0.9, 'Possible self-harm concern');
  if (hits(t, PII)) bump('pii', 0.7, 'Personal information exposure');
  for (const term of ctx.extraBlockedTerms ?? [])
    if (term && t.toLowerCase().includes(term.toLowerCase())) bump('bullying', targeted ? 0.85 : 0.55, 'Moderator-configured term');

  const language = detectLanguage(t);
  const maxScore = Math.max(...Object.values(s));
  const categories = (Object.keys(s) as ModCategory[]).filter((c) => s[c] >= 0.5);
  // Uncertain: unsupported script, or borderline score.
  const uncertain = language === 'unknown' || (maxScore >= 0.35 && maxScore < 0.5);
  return { scores: s, maxScore, categories, reasons: [...new Set(reasons)], uncertain, language };
}

export interface ModDecision { outcome: ModOutcome; needsHumanReview: boolean; safetyEscalated: boolean; userMessage: string }

export const MOD_MESSAGES = {
  held: 'Your comment is being reviewed before it becomes visible to the community.',
  rejected: 'This content could not be published because it appears to break our community guidelines (for example, advertising or unsafe links). You can edit it and try again, or appeal.',
  hidden: 'This content has been hidden while a moderator reviews it against our community guidelines.',
  safety: 'Thank you for sharing. A member of our team will review this. If you are in danger or thinking about harming yourself, please contact emergency services or see the urgent help page now.',
  approved: 'Published.',
};

/** Maps classifier output to a workflow outcome. Never suspends users — that is a human decision. */
export function decideModeration(r: ModResult, th: ModThresholds = DEFAULT_MOD_THRESHOLDS): ModDecision {
  if (r.scores.self_harm >= th.hold)
    return { outcome: 'FLAGGED', needsHumanReview: true, safetyEscalated: true, userMessage: MOD_MESSAGES.safety };
  if (r.scores.threat >= th.hide)
    return { outcome: 'HIDDEN', needsHumanReview: true, safetyEscalated: true, userMessage: MOD_MESSAGES.hidden };
  if (Math.max(r.scores.spam, r.scores.malicious_link) >= th.reject && r.maxScore === Math.max(r.scores.spam, r.scores.malicious_link))
    return { outcome: 'REJECTED', needsHumanReview: false, safetyEscalated: false, userMessage: MOD_MESSAGES.rejected };
  if (r.maxScore >= th.hide)
    return { outcome: 'HIDDEN', needsHumanReview: true, safetyEscalated: false, userMessage: MOD_MESSAGES.hidden };
  if (r.maxScore >= th.hold || r.uncertain)
    return { outcome: 'FLAGGED', needsHumanReview: true, safetyEscalated: false, userMessage: MOD_MESSAGES.held };
  return { outcome: 'APPROVED', needsHumanReview: false, safetyEscalated: false, userMessage: MOD_MESSAGES.approved };
}

export function validateThresholds(t: ModThresholds) {
  return t.hold > 0 && t.hold < t.hide && t.hide <= t.reject && t.reject <= 1;
}

/** Normalised hash input for duplicate detection. */
export const normalizeForDuplicate = (text: string) =>
  text.toLowerCase().normalize('NFKC').replace(/https?:\/\/\S+/g, 'URL').replace(/[\s\p{P}]+/gu, ' ').trim();
