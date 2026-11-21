import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, ChevronDown, Clock, LifeBuoy, Mail, Send, ShieldCheck } from 'lucide-react';
import { Button, ErrorState, Input, Textarea, cx } from '../../components/ui';
import { post } from '../../lib/hooks';
import { errMsg } from '../../lib/api';
import { Seo } from '../components/Seo';
import { AnimatedItem, AnimatedSection, SectionHeading } from '../components/AnimatedSection';
import { useMotionVariants, EASE } from '../animations/variants';

type Values = { name: string; email: string; subject: string; message: string };
type Errors = Partial<Record<keyof Values, string>>;

const LIMITS = { name: [2, 80], email: [3, 160], subject: [3, 140], message: [10, 4000] } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: Values): Errors {
  const e: Errors = {};
  const len = (k: keyof Values) => v[k].trim().length;
  if (len('name') < LIMITS.name[0]) e.name = 'Please enter your name (at least 2 characters).';
  else if (len('name') > LIMITS.name[1]) e.name = 'Name must be 80 characters or fewer.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email address.';
  else if (len('email') > LIMITS.email[1]) e.email = 'Email must be 160 characters or fewer.';
  if (len('subject') < LIMITS.subject[0]) e.subject = 'Subject must be at least 3 characters.';
  else if (len('subject') > LIMITS.subject[1]) e.subject = 'Subject must be 140 characters or fewer.';
  if (len('message') < LIMITS.message[0]) e.message = 'Message must be at least 10 characters.';
  else if (len('message') > LIMITS.message[1]) e.message = 'Message must be 4000 characters or fewer.';
  return e;
}

function errorText(e: unknown) {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status === 429) return 'Too many messages, please try later.';
  return errMsg(e);
}

const FAQ = [
  { q: 'Is Sathi an emergency service?', a: 'No. Sathi does not provide crisis or emergency response, and messages are not monitored around the clock. If you or someone else is in immediate danger, please use the urgent help options on our Safety page or contact local emergency services.' },
  { q: 'Does Sathi give a diagnosis?', a: 'No. Check-ins and the support assessment describe how you are doing and what support you are looking for. They are not medical or psychological assessments and never produce a diagnosis.' },
  { q: 'Who sees my information?', a: 'Only what you allow. Sensitive information — your assessment summary, support need profile, check-in trends and support history — is hidden from counselors unless you grant consent for that category. You can withdraw consent at any time.' },
  { q: 'How do counselors get verified?', a: 'Counselors submit their professional details and credentials when they join. The Sathi admin team reviews them, and only verified counselors appear in matching.' },
  { q: 'How do organizations join?', a: 'Create an account as an organization and submit your details for verification. Once verified, you can publish services and programs; new programs are reviewed before they go live.' },
  { q: 'Is my community post anonymous?', a: 'Community posts appear under a pseudonym rather than your real name, so they are pseudonymous rather than fully anonymous. All posts are moderated before they are published, and you can report anything that feels unsafe.' },
  { q: 'What does it cost?', a: 'Counselors set their own session fees, which you see before booking, and some programs offered by organizations are free.' },
  { q: 'How do I delete my data?', a: 'Signed-in young people can manage consent and delete their account and data from the Privacy center in their dashboard. If you need help, send us a message using this form.' },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <h3>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex w-full items-center justify-between gap-4 rounded-lg py-5 text-left font-semibold text-slate-900 hover:text-brand-700">
          {q}
          <span className={cx('grid size-8 shrink-0 place-items-center rounded-full transition-colors', open ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
            <ChevronDown className={cx('size-4 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} role="region" aria-label={q} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <p className="pr-12 pb-5 leading-relaxed text-slate-600">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ContactPage() {
  const [values, setValues] = useState<Values>({ name: '', email: '', subject: '', message: '' });
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [apiError, setApiError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const startedAt = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const v = useMotionVariants();

  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    const next = { ...values, [k]: e.target.value };
    setValues(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setApiError('');
    const errs = validate(values);
    setErrors(errs);
    const first = (Object.keys(errs) as (keyof Values)[])[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setStatus('loading');
    try {
      const res = await post<{ received: boolean; message: string }>('/contact', {
        name: values.name.trim(), email: values.email.trim(), subject: values.subject.trim(), message: values.message.trim(),
        website, startedAt: startedAt.current,
      });
      setSuccessMsg(res?.message ?? 'Thank you — your message has been received.');
      setStatus('success');
      window.setTimeout(() => successRef.current?.focus(), 50);
    } catch (err) {
      setApiError(errorText(err));
      setStatus('idle');
    }
  };

  const reset = () => {
    setValues({ name: '', email: '', subject: '', message: '' });
    setErrors({});
    setTouched(false);
    setStatus('idle');
    startedAt.current = Date.now();
  };

  return (
    <>
      <Seo title="Contact Us" description="Questions about Sathi? Send us a message. For urgent help, visit our safety page — Sathi is not an emergency service." />

      <section aria-labelledby="contact-title" className="relative isolate -mt-16 overflow-hidden px-4 pt-32 pb-20 sm:px-6 lg:-mt-[4.5rem] lg:px-8 lg:pt-40 lg:pb-28">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/80 via-white to-white" />
        <div aria-hidden className="absolute -top-20 -left-32 -z-10 size-[30rem] rounded-full bg-teal-200/40 blur-3xl" />
        <div aria-hidden className="absolute top-40 -right-32 -z-10 size-[26rem] rounded-full bg-violet-200/30 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:gap-16">
          <AnimatedSection className="lg:col-span-5">
            <AnimatedItem><p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Contact Us</p></AnimatedItem>
            <AnimatedItem>
              <h1 id="contact-title" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance text-slate-900 sm:text-5xl">We’d love to hear from you.</h1>
            </AnimatedItem>
            <AnimatedItem>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">Questions about Sathi, joining as a counselor or organization, or feedback on the platform — send us a message and the team will get back to you.</p>
            </AnimatedItem>
            <AnimatedItem className="mt-10 space-y-4">
              <div className="flex gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 backdrop-blur">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Mail className="size-5" aria-hidden /></span>
                <div>
                  <h2 className="font-semibold text-slate-900">Use this form</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">The contact form is the best way to reach us. Please don’t include sensitive personal details.</p>
                </div>
              </div>
              <div className="flex gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 backdrop-blur">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700"><Clock className="size-5" aria-hidden /></span>
                <div>
                  <h2 className="font-semibold text-slate-900">Response time</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">We usually reply within a few working days.</p>
                </div>
              </div>
              <Link to="/safety" className="group flex gap-4 rounded-3xl border border-rose-200 bg-rose-50 p-5 transition-colors hover:bg-rose-100/70">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-rose-600"><LifeBuoy className="size-5" aria-hidden /></span>
                <div>
                  <h2 className="font-semibold text-rose-900">Need urgent help?</h2>
                  <p className="mt-1 text-sm leading-relaxed text-rose-800">Sathi is not an emergency service and this form isn’t monitored for emergencies. Get urgent help now <ArrowRight className="inline size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></p>
                </div>
              </Link>
            </AnimatedItem>
          </AnimatedSection>

          <motion.div variants={v.fadeUp} initial="hidden" animate="show" className="lg:col-span-7">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.35)] sm:p-10">
              <AnimatePresence mode="wait" initial={false}>
                {status === 'success' ? (
                  <motion.div
                    key="ok"
                    ref={successRef}
                    tabIndex={-1}
                    role="status"
                    initial={{ opacity: 0, scale: v.reduce ? 1 : 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}
                    className="flex flex-col items-center py-10 text-center outline-none"
                  >
                    <span className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-8" aria-hidden /></span>
                    <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Message sent</h2>
                    <p className="mt-3 max-w-md leading-relaxed text-slate-600">{successMsg}</p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                      <Button variant="outline" onClick={reset}>Send another message</Button>
                      <Link to="/blog" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100">Read the blog</Link>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form key="form" ref={formRef} noValidate onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5" aria-describedby="contact-privacy">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Send a message</h2>
                    {apiError && <ErrorState message={apiError} />}
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input label="Name" name="name" autoComplete="name" value={values.name} onChange={set('name')} error={errors.name} maxLength={LIMITS.name[1]} required />
                      <Input label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} maxLength={LIMITS.email[1]} required />
                    </div>
                    <Input label="Subject" name="subject" value={values.subject} onChange={set('subject')} error={errors.subject} maxLength={LIMITS.subject[1]} required />
                    <Textarea
                      label="Message" name="message" rows={6} value={values.message} onChange={set('message')} error={errors.message} maxLength={LIMITS.message[1]} required
                      hint={`${values.message.trim().length}/${LIMITS.message[1]} characters · at least ${LIMITS.message[0]}`}
                    />
                    {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
                    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0">
                      <label htmlFor="contact-website">Website</label>
                      <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>
                    <div className="flex flex-col-reverse items-start gap-4 pt-1 sm:flex-row sm:items-center sm:justify-between">
                      <p id="contact-privacy" className="flex items-start gap-2 text-xs leading-relaxed text-slate-500 sm:max-w-xs">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                        We only use your details to reply to your message.
                      </p>
                      <Button type="submit" loading={status === 'loading'} className="w-full rounded-full px-6 py-3 sm:w-auto">
                        {status !== 'loading' && <Send className="size-4" aria-hidden />} {status === 'loading' ? 'Sending…' : 'Send message'}
                      </Button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeading align="left" id="faq-title" eyebrow="FAQ" title="Common questions" lead="Can’t find what you’re looking for? Send us a message using the form above." />
          </div>
          <AnimatedItem standalone className="rounded-3xl border border-slate-200 bg-white px-6 sm:px-8 lg:col-span-8">
            {FAQ.map((f, i) => (
              <FaqItem key={f.q} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
            ))}
          </AnimatedItem>
        </div>
      </section>

      <section aria-labelledby="support-title" className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-gradient-to-br from-brand-50 via-sky-50 to-violet-50 p-8 sm:p-12">
          <h2 id="support-title" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Support information</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { t: 'Already using Sathi?', d: 'Your dashboard has notifications, appointments and your Privacy center.', l: '/login', lt: 'Log in' },
              { t: 'In immediate danger?', d: 'Sathi is not an emergency service. Use the urgent help options right away.', l: '/safety', lt: 'Urgent help' },
              { t: 'Looking for information?', d: 'Our blog has general articles on wellbeing — not professional advice.', l: '/blog', lt: 'Visit the blog' },
            ].map((x) => (
              <div key={x.t}>
                <h3 className="font-semibold text-slate-900">{x.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{x.d}</p>
                <Link to={x.l} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">{x.lt} <ArrowRight className="size-3.5" aria-hidden /></Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
