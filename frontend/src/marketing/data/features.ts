import type { LucideIcon } from 'lucide-react';
import {
  HeartPulse, ClipboardList, Sparkles, CalendarCheck, Video, Target, ListChecks, TrendingUp, Trophy, Compass, MessagesSquare, Users, BookOpen,
  ShieldCheck, UserCheck, CalendarClock, FileText, ClipboardCheck, Lightbulb, Building2, BadgeCheck, Megaphone, LayoutGrid, Ticket, Flag, KeyRound, EyeOff, Route,
} from 'lucide-react';

export interface Feature { id: string; icon: LucideIcon; title: string; summary: string; how: string[] }
export interface FeatureGroup { id: 'youth' | 'counselors' | 'organizations' | 'safety'; label: string; eyebrow: string; title: string; intro: string; features: Feature[] }

/* ------------------------------------------------------------------ */
/* The five-step journey (used by the hero and "How Sathi works").      */
/* ------------------------------------------------------------------ */
export const journeySteps = [
  { id: 'check-in', icon: HeartPulse, title: 'Wellbeing check-in', short: 'Check in', text: 'A quick, private check-in on mood, sleep, stress and energy. It takes about a minute and helps you notice patterns over time.', detail: ['Emoji-scale mood rating', 'Optional short note — only you see it', 'Builds your personal trend line'] },
  { id: 'assessment', icon: ClipboardList, title: 'Support assessment', short: 'Assess', text: 'A step-by-step questionnaire that captures what kind of support you are looking for. It is not a diagnosis — it simply describes your needs and preferences.', detail: ['One question at a time, save and resume', 'Concerns, language and session preferences', 'You decide who can see the summary'] },
  { id: 'matching', icon: Sparkles, title: 'Counselor matching', short: 'Match', text: 'Sathi suggests verified counselors and explains every suggestion — which factors matched strongly and where the fit is only partial.', detail: ['Six transparent matching factors', '"Why this match?" breakdown for each counselor', 'You choose — nothing is assigned automatically'] },
  { id: 'support', icon: CalendarCheck, title: 'Ongoing support', short: 'Support', text: 'Book a session in person or online through Google Meet, then work with your counselor on a shared support plan with goals and small tasks.', detail: ['Book into real availability', 'Online sessions with a Google Meet link', 'Collaborative plans, goals and tasks'] },
  { id: 'progress', icon: TrendingUp, title: 'Progress over time', short: 'Progress', text: 'See how things are moving with check-in trends, completed tasks and milestones — so support continues well beyond the first conversation.', detail: ['Trend charts from your check-ins', 'Milestones as goals are reached', 'Program suggestions that fit your plan'] },
] as const;

/* ------------------------------------------------------------------ */
/* Matching factors — mirrors the platform's default weights.          */
/* ------------------------------------------------------------------ */
export const matchingFactors = [
  { id: 'concern', label: 'Your concerns', weight: 30, hint: 'How closely the counselor’s focus areas cover the concerns you shared.' },
  { id: 'specialization', label: 'Specialization', weight: 20, hint: 'Relevant specializations and the kinds of support they offer.' },
  { id: 'language', label: 'Language', weight: 15, hint: 'Whether you share a language you are comfortable talking in.' },
  { id: 'availability', label: 'Availability', weight: 15, hint: 'Open slots that fit the times you said suit you.' },
  { id: 'location', label: 'Location', weight: 10, hint: 'Distance or region — useful for in-person sessions.' },
  { id: 'mode', label: 'Session format', weight: 10, hint: 'Online, in-person or either — matched to your preference.' },
] as const;

/* ------------------------------------------------------------------ */
/* Consent categories — sensitive data is deny-by-default.             */
/* ------------------------------------------------------------------ */
export const consentCategories = [
  { id: 'ASSESSMENT_SUMMARY', label: 'Assessment summary', hint: 'The summary produced by your support assessment.' },
  { id: 'SUPPORT_NEED_PROFILE', label: 'Support need profile', hint: 'Your concerns and preferences used for matching.' },
  { id: 'CHECKIN_TRENDS', label: 'Check-in trends', hint: 'Mood and wellbeing trends from your check-ins.' },
  { id: 'SUPPORT_HISTORY', label: 'Support history', hint: 'Past sessions, plans and progress.' },
] as const;

/* ------------------------------------------------------------------ */
/* Feature groups for the Features page.                               */
/* ------------------------------------------------------------------ */
export const featureGroups: FeatureGroup[] = [
  {
    id: 'youth', label: 'Young people', eyebrow: 'For young people', title: 'Support that fits you — and stays with you',
    intro: 'Everything a young person needs to find support, understand their options and keep moving forward, with privacy controls at every step.',
    features: [
      { id: 'checkins', icon: HeartPulse, title: 'Wellbeing check-ins', summary: 'Quick, private check-ins on how you are feeling.', how: ['Pick a mood on an emoji scale and rate sleep, stress and energy.', 'Add an optional note if you like.', 'Each check-in becomes part of your personal trend chart.'] },
      { id: 'assessment', icon: ClipboardList, title: 'Step-by-step assessment', summary: 'Describe the support you are looking for, one question at a time.', how: ['Answer short questions about concerns and preferences.', 'Your progress is saved so you can come back later.', 'The result is a support profile — never a diagnosis.'] },
      { id: 'matching', icon: Sparkles, title: 'Explainable counselor matching', summary: 'Suggestions with clear reasons behind every score.', how: ['Verified counselors are scored on six transparent factors.', 'Each suggestion shows strong matches and partial gaps.', 'You compare and choose; nothing is assigned for you.'] },
      { id: 'booking', icon: CalendarCheck, title: 'Appointment booking', summary: 'Book into a counselor’s real availability.', how: ['Browse open slots on the counselor’s calendar.', 'Request a session; the counselor confirms it.', 'Reminders and status updates arrive in your notifications.'] },
      { id: 'meetings', icon: Video, title: 'Online meetings', summary: 'Join online sessions through Google Meet.', how: ['When a session is online, a Google Meet link is created for it.', 'The “Join meeting” button appears on your appointment.', 'In-person sessions show the location instead.'] },
      { id: 'plans', icon: Route, title: 'Collaborative support plans', summary: 'A shared plan you build together with your counselor.', how: ['Your counselor proposes a plan after you start working together.', 'You can review it, discuss it and agree on it.', 'The plan stays visible to both of you as it evolves.'] },
      { id: 'goals', icon: Target, title: 'Goals & tasks', summary: 'Break big changes into small, doable steps.', how: ['Goals sit inside your support plan.', 'Each goal has small tasks with optional due dates.', 'Tick tasks off and see the goal move forward.'] },
      { id: 'analytics', icon: TrendingUp, title: 'Progress analytics', summary: 'See your trends and progress at a glance.', how: ['Charts built from your check-ins and completed tasks.', 'Spot patterns across weeks, not just days.', 'Share trends with your counselor only if you choose to.'] },
      { id: 'milestones', icon: Trophy, title: 'Milestones', summary: 'Celebrate the progress you make.', how: ['Reaching a goal or key step marks a milestone.', 'Milestones appear on your journey timeline.', 'A gentle reminder of how far you have come.'] },
      { id: 'programs', icon: Compass, title: 'Program discovery & booking', summary: 'Find wellbeing programs from verified organizations.', how: ['Browse programs by topic, format and date.', 'See capacity and book a place — or join a waitlist.', 'Counselors can recommend programs that fit your plan.'] },
      { id: 'chat', icon: MessagesSquare, title: 'Private communication', summary: 'Message your counselor privately between sessions.', how: ['Conversations are only between you and your counselor.', 'Messages are linked to your support relationship.', 'Not for emergencies — urgent help is always one tap away.'] },
      { id: 'community', icon: Users, title: 'Peer community', summary: 'A moderated space to share and support each other.', how: ['Post under a pseudonym rather than your real name.', 'Posts are checked by moderation before they go live.', 'Report anything that feels unsafe or unkind.'] },
      { id: 'resources', icon: BookOpen, title: 'Resource library', summary: 'Helpful reading and tools, curated by the team.', how: ['Articles and resources grouped by topic.', 'Search for what you need, when you need it.', 'General information — not professional advice.'] },
      { id: 'consent', icon: ShieldCheck, title: 'Privacy & consent controls', summary: 'You decide who sees what, category by category.', how: ['Sensitive data is shared only with your active consent.', 'Grant or withdraw consent at any time in your Privacy center.', 'You can also download a copy of your data or delete your account from there.'] },
    ],
  },
  {
    id: 'counselors', label: 'Counselors', eyebrow: 'For counselors', title: 'Tools that keep care continuous',
    intro: 'Counselors manage their practice, sessions and the plans they build with each young person — with consent-aware access to the information that matters.',
    features: [
      { id: 'profile', icon: UserCheck, title: 'Profile & verification', summary: 'A verified profile that young people can trust.', how: ['Describe your focus areas, languages and approach.', 'Upload credentials for review by the Sathi admin team.', 'Only verified counselors appear in matching.'] },
      { id: 'appointments', icon: CalendarClock, title: 'Appointment management', summary: 'Availability, requests and confirmations in one place.', how: ['Publish weekly availability and set your fee.', 'Confirm or decline incoming requests.', 'Track upcoming, completed and missed sessions.'] },
      { id: 'meetings', icon: Video, title: 'Online meetings', summary: 'Connect Google once and run sessions online.', how: ['Link your Google account from settings.', 'Online sessions automatically get a Meet link.', 'Both you and the young person can join from the appointment.'] },
      { id: 'records', icon: FileText, title: 'Session records', summary: 'Keep structured notes after each session.', how: ['Record a summary and next steps after a session.', 'Private notes stay private to you — never shared.', 'Shared notes are visible to the young person.'] },
      { id: 'plans', icon: Route, title: 'Support plans', summary: 'Build plans together with each young person.', how: ['Draft a plan with goals and tasks.', 'Propose it for the young person to review.', 'Update it as needs change over time.'] },
      { id: 'goals', icon: ClipboardCheck, title: 'Goal & task monitoring', summary: 'See which steps are done and which are stuck.', how: ['Follow task completion across each plan.', 'Spot overdue tasks early.', 'Adjust goals in your next session.'] },
      { id: 'progress', icon: TrendingUp, title: 'Progress tracking', summary: 'Trends you can see — with the young person’s consent.', how: ['Check-in trends are visible only with active consent.', 'Milestones show meaningful progress.', 'Use progress to guide conversations, not to judge.'] },
      { id: 'recommend', icon: Lightbulb, title: 'Program recommendations', summary: 'Point young people to programs that fit their plan.', how: ['Browse programs published by verified organizations.', 'Recommend one to a client from their profile.', 'The young person decides whether to book.'] },
    ],
  },
  {
    id: 'organizations', label: 'Organizations', eyebrow: 'For organizations', title: 'Reach the young people your programs are for',
    intro: 'Schools, NGOs and community organizations publish services and programs, manage bookings and keep track of capacity and attendance.',
    features: [
      { id: 'verification', icon: BadgeCheck, title: 'Verification', summary: 'A verified organization profile.', how: ['Create an organization account.', 'Submit details and documents for admin review.', 'Once verified, you can publish to young people.'] },
      { id: 'services', icon: Megaphone, title: 'Service publishing', summary: 'Describe the ongoing services you offer.', how: ['Add services with descriptions and contact routes.', 'Services are reviewed before they go live.', 'Keep them up to date as things change.'] },
      { id: 'programs', icon: LayoutGrid, title: 'Program publishing', summary: 'Workshops, groups and courses with clear details.', how: ['Create a program with dates, format and capacity.', 'Submit it for approval.', 'Approved programs appear in program discovery.'] },
      { id: 'bookings', icon: Ticket, title: 'Booking management', summary: 'See who has booked and who is waiting.', how: ['Review bookings for each program.', 'Waitlisted places are offered as spots open up.', 'Communicate changes through notifications.'] },
      { id: 'capacity', icon: ClipboardCheck, title: 'Capacity & attendance', summary: 'Stay on top of numbers on the day.', how: ['Set capacity limits per program.', 'Mark attendance for each session.', 'Use attendance to plan future programs.'] },
    ],
  },
  {
    id: 'safety', label: 'Platform safety', eyebrow: 'Platform safety', title: 'Safety and privacy are built in, not bolted on',
    intro: 'Sathi is designed to be a careful, respectful space. It is not an emergency service — urgent help information is always available.',
    features: [
      { id: 'moderation', icon: Flag, title: 'Community moderation', summary: 'Posts are reviewed before they are published.', how: ['New community content goes into a moderation queue.', 'Trained admins approve, hide or remove content.', 'Anyone can report something that feels wrong.'] },
      { id: 'detection', icon: EyeOff, title: 'Spam & bullying detection', summary: 'Automatic checks flag harmful content early.', how: ['Text is screened for spam, bullying and risk signals.', 'Flagged content is held for human review.', 'Risk signals surface urgent help information.'] },
      { id: 'privacy', icon: ShieldCheck, title: 'Privacy controls', summary: 'Consent per category, deny-by-default.', how: ['Sensitive data is hidden unless you grant consent.', 'Withdraw consent at any time.', 'Manage or delete your data from the Privacy center.'] },
      { id: 'auth', icon: KeyRound, title: 'Secure authentication', summary: 'Modern account security.', how: ['Passwords are stored hashed, never in plain text.', 'Sessions use short-lived tokens with secure refresh.', 'Connected-account tokens are encrypted at rest.'] },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Home: bento grid + audiences + highlights                           */
/* ------------------------------------------------------------------ */
export const audiences = [
  {
    id: 'youth', label: 'Youth', title: 'For young people',
    text: 'Find support without the guesswork. Check in, understand your options, choose a counselor with clear reasons and keep going with a plan that is yours.',
    benefits: ['Private check-ins and trend charts', 'Matching you can understand', 'Online or in-person sessions', 'Plans, goals and small tasks', 'Programs and a moderated community', 'Consent you can change any time'],
    cta: { label: 'Join as a young person', to: '/register' },
  },
  {
    id: 'counselors', label: 'Counselors', title: 'For counselors',
    text: 'Spend less time coordinating and more time supporting. Manage availability, sessions, notes and plans — and see progress with consent.',
    benefits: ['Verified professional profile', 'Availability and request handling', 'Google Meet for online sessions', 'Session records with private notes', 'Collaborative support plans', 'Program recommendations'],
    cta: { label: 'Join as a counselor', to: '/register' },
  },
  {
    id: 'organizations', label: 'Organizations', title: 'For organizations',
    text: 'Make your programs and services easy to find for the young people who need them, and manage bookings without spreadsheets.',
    benefits: ['Verified organization profile', 'Publish services and programs', 'Bookings and waitlists', 'Capacity limits', 'Attendance tracking', 'Reach through counselor recommendations'],
    cta: { label: 'Register your organization', to: '/register' },
  },
] as const;

export const highlights = [
  { icon: Sparkles, title: 'Explainable matching', text: 'Every counselor suggestion shows why — strong matches and partial gaps.' },
  { icon: ShieldCheck, title: 'Consent you control', text: 'Sensitive information stays hidden unless you choose to share it.' },
  { icon: Video, title: 'Google Meet sessions', text: 'Online sessions come with a meeting link right on the appointment.' },
  { icon: Users, title: 'Moderated community', text: 'Peer posts are reviewed before they appear, and can always be reported.' },
] as const;

export const counters = [
  { value: 5, label: 'steps from check-in to progress' },
  { value: 4, label: 'consent categories you control' },
  { value: 6, label: 'transparent matching factors' },
] as const;
