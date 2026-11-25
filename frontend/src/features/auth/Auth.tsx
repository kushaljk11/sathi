import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { z } from 'zod';
import { HeartHandshake, Users, GraduationCap, Building2, ArrowLeft, Sparkles, Shield, Heart } from 'lucide-react';
import { registerSchema } from '@sathi/shared';
import { useAuth } from '../../lib/auth';
import { api, errMsg } from '../../lib/api';
import { Button, Input, ErrorState } from '../../components/ui';

export const homeFor = (role: string) =>
  ({ YOUTH: '/youth', COUNSELOR: '/counselor', ORGANIZATION: '/organization', ADMIN: '/admin' })[role] ?? '/';

// ── Brand panel (left side) ────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:flex-col lg:justify-between bg-gradient-to-br from-brand-600 via-brand-700 to-teal-900 p-10 text-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
          <HeartHandshake className="size-6 text-white" />
        </div>
        <span className="text-2xl font-bold tracking-tight">Sathi</span>
      </div>

      {/* Tagline */}
      <div className="space-y-6">
        <h2 className="text-4xl font-bold leading-tight">
          Your wellbeing
          <br />
          <span className="text-brand-200">journey starts here.</span>
        </h2>
        <p className="text-brand-100/90 text-lg leading-relaxed max-w-sm">
          Connect with counselors, track your progress, and find community support — all in one safe place.
        </p>

        {/* Features list */}
        <div className="space-y-3 pt-2">
          {[
            { icon: Shield, text: 'Private & secure — your data is always yours' },
            { icon: Heart, text: 'Matched with the right support for you' },
            { icon: Sparkles, text: 'Journeys, programs & community resources' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm text-brand-100">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/15">
                <Icon className="size-3.5" />
              </div>
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-brand-200/60">
        © {new Date().getFullYear()} Sathi — Youth Wellbeing Platform
      </p>
    </div>
  );
}

// ── Form shell (right side) ────────────────────────────────────────────────────
function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
            <HeartHandshake className="size-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">Sathi</span>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to home
          </Link>

          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200/60">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Split shell wrapper ────────────────────────────────────────────────────────
function SplitShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[480px_1fr]">
      <BrandPanel />
      <Shell title={title} subtitle={subtitle}>
        {children}
      </Shell>
    </div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────────
export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>();
  return (
    <SplitShell title="Welcome back" subtitle="Sign in to continue your journey.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setErr('');
          try { nav(homeFor((await login(v.email, v.password)).role)); }
          catch (e) { setErr(errMsg(e)); }
        })}
      >
        {err && <ErrorState message={err} />}
        <Input label="Email address" type="email" autoComplete="email" {...register('email', { required: true })} />
        <Input label="Password" type="password" autoComplete="current-password" {...register('password', { required: true })} />
        <div className="flex justify-end">
          <Link className="text-sm text-brand-600 hover:underline" to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>Sign in</Button>
        <p className="text-center text-sm text-slate-500">
          New here?{' '}
          <Link className="font-semibold text-brand-600 hover:underline" to="/register">Create an account</Link>
        </p>
      </form>
    </SplitShell>
  );
}

// ── Role cards ─────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'YOUTH', label: 'Young person', desc: 'Seeking support & guidance', icon: Users, color: 'border-teal-300 bg-teal-50 text-teal-700' },
  { value: 'COUNSELOR', label: 'Counselor', desc: 'Providing professional care', icon: GraduationCap, color: 'border-violet-300 bg-violet-50 text-violet-700' },
  { value: 'ORGANIZATION', label: 'Organization', desc: 'Offering programs & services', icon: Building2, color: 'border-sky-300 bg-sky-50 text-sky-700' },
] as const;

type RegRole = 'YOUTH' | 'COUNSELOR' | 'ORGANIZATION';

type Reg = z.infer<typeof registerSchema>;

export function Register() {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [selectedRole, setSelectedRole] = useState<RegRole>('YOUTH');
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Reg>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'YOUTH' },
  });

  if (done) {
    return (
      <SplitShell title="Check your email" subtitle="Almost there!">
        <div className="rounded-xl bg-brand-50 p-5 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-100">
            <HeartHandshake className="size-6 text-brand-600" />
          </div>
          <p className="text-sm text-slate-700">
            We've sent a verification link to your inbox.
            <br />
            Once verified, you can{' '}
            <Link className="font-semibold text-brand-600 hover:underline" to="/login">sign in</Link>.
          </p>
        </div>
      </SplitShell>
    );
  }

  return (
    <SplitShell title="Create your account" subtitle="Join the Sathi community today.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setErr('');
          try { await api.post('/auth/register', v); setDone(true); }
          catch (e) { setErr(errMsg(e)); }
        })}
      >
        {err && <ErrorState message={err} />}

        {/* Role selector */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">I am joining as</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ROLES.map((r) => {
              const isSelected = selectedRole === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { setSelectedRole(r.value); setValue('role', r.value); }}
                  className={[
                    'flex flex-col items-center rounded-xl border-2 p-3 text-center transition-all duration-150',
                    isSelected
                      ? `${r.color} border-current shadow-sm`
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <r.icon className="mb-1 size-5" />
                  <span className="text-xs font-semibold">{r.label}</span>
                  <span className="mt-0.5 text-[10px] leading-tight opacity-75">{r.desc}</span>
                </button>
              );
            })}
          </div>
          <input type="hidden" {...register('role')} />
        </div>

        <Input label="Your name" {...register('displayName')} error={errors.displayName?.message} />
        <Input label="Email address" type="email" {...register('email')} error={errors.email?.message} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters"
          {...register('password')}
          error={errors.password?.message}
        />
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create account</Button>
        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link className="font-semibold text-brand-600 hover:underline" to="/login">Sign in</Link>
        </p>
      </form>
    </SplitShell>
  );
}

// ── Verify email ───────────────────────────────────────────────────────────────
export function VerifyEmail() {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const token = new URLSearchParams(location.search).get('token');
  return (
    <SplitShell title="Verify your email" subtitle="One click and you're all set.">
      {state === 'ok' ? (
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100">
            <HeartHandshake className="size-6 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-700">
            Email verified!{' '}
            <Link className="font-semibold text-brand-600 hover:underline" to="/login">Sign in now</Link>
          </p>
        </div>
      ) : (
        <>
          <Button
            className="w-full"
            size="lg"
            onClick={() => api.post('/auth/verify-email', { token }).then(() => setState('ok'), () => setState('err'))}
          >
            Confirm my email
          </Button>
          {state === 'err' && (
            <div className="mt-3">
              <ErrorState message="This link is invalid or has expired. Please request a new one." />
            </div>
          )}
        </>
      )}
    </SplitShell>
  );
}

// ── Forgot password ────────────────────────────────────────────────────────────
export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string }>();
  return (
    <SplitShell title="Reset your password" subtitle="We'll send you a link to get back in.">
      {sent ? (
        <div className="rounded-xl bg-brand-50 p-5 text-center">
          <p className="text-sm text-slate-700">
            If an account exists for that email, a reset link has been sent.
          </p>
          <Link className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline" to="/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (v) => {
            await api.post('/auth/forgot-password', v).catch(() => {});
            setSent(true);
          })}
        >
          <Input label="Email address" type="email" autoComplete="email" {...register('email', { required: true })} />
          <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>Send reset link</Button>
          <p className="text-center text-sm">
            <Link className="text-brand-600 hover:underline" to="/login">← Back to sign in</Link>
          </p>
        </form>
      )}
    </SplitShell>
  );
}

// ── Reset password ─────────────────────────────────────────────────────────────
export function ResetPassword() {
  const [state, setState] = useState<'idle' | 'ok'>('idle');
  const [err, setErr] = useState('');
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const { register, handleSubmit, formState } = useForm<{ password: string; confirm: string }>();
  if (state === 'ok') {
    return (
      <SplitShell title="Password updated" subtitle="You're all set!">
        <div className="rounded-xl bg-emerald-50 p-5 text-center">
          <p className="text-sm text-slate-700">
            Your password has been updated. You can now{' '}
            <Link className="font-semibold text-brand-600 hover:underline" to="/login">sign in</Link>.
          </p>
        </div>
      </SplitShell>
    );
  }
  return (
    <SplitShell title="Choose a new password" subtitle="Make it strong and memorable.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setErr('');
          if (v.password !== v.confirm) return setErr('Passwords do not match');
          try { await api.post('/auth/reset-password', { token, password: v.password }); setState('ok'); }
          catch (e) { setErr(errMsg(e)); }
        })}
      >
        {err && <ErrorState message={err} />}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters"
          {...register('password', { required: true, minLength: 10 })}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          {...register('confirm', { required: true })}
        />
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>Update password</Button>
      </form>
    </SplitShell>
  );
}
