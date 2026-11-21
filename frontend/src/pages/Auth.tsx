import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { z } from 'zod';
import { HeartHandshake } from 'lucide-react';
import { registerSchema } from '@sathi/shared';
import { useAuth } from '../lib/auth';
import { api, errMsg } from '../lib/api';
import { Button, Input, ErrorState } from '../components/ui';

export const homeFor = (role: string) => ({ YOUTH: '/youth', COUNSELOR: '/counselor', ORGANIZATION: '/organization', ADMIN: '/admin' })[role] ?? '/';

const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-sky-50 p-4">
    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-brand-900/5">
      <div className="mb-6 text-center">
        <HeartHandshake className="mx-auto size-10 text-brand-600" />
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">From finding support to staying supported.</p>
      </div>
      {children}
    </div>
  </div>
);

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>();
  return (
    <Shell title="Welcome back">
      <form className="space-y-4" onSubmit={handleSubmit(async (v) => { setErr(''); try { nav(homeFor((await login(v.email, v.password)).role)); } catch (e) { setErr(errMsg(e)); } })}>
        {err && <ErrorState message={err} />}
        <Input label="Email" type="email" autoComplete="email" {...register('email', { required: true })} />
        <Input label="Password" type="password" autoComplete="current-password" {...register('password', { required: true })} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>Sign in</Button>
        <p className="text-center text-sm"><Link className="text-brand-700" to="/forgot-password">Forgot password?</Link></p>
        <p className="text-center text-sm text-slate-500">New here? <Link className="font-medium text-brand-700" to="/register">Create an account</Link></p>
      </form>
    </Shell>
  );
}

type Reg = z.infer<typeof registerSchema>;
export function Register() {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Reg>({ resolver: zodResolver(registerSchema), defaultValues: { role: 'YOUTH' } });
  if (done) return <Shell title="Check your email"><p className="text-center text-slate-600">We sent a verification link. Then <Link className="text-brand-700" to="/login">sign in</Link>.</p></Shell>;
  return (
    <Shell title="Create your account">
      <form className="space-y-4" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api.post('/auth/register', v); setDone(true); } catch (e) { setErr(errMsg(e)); } })}>
        {err && <ErrorState message={err} />}
        <Input label="Name" {...register('displayName')} error={errors.displayName?.message} />
        <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Password" type="password" autoComplete="new-password" {...register('password')} error={errors.password?.message} />
        <label className="block space-y-1.5"><span className="text-sm font-medium">I am joining as</span>
          <select {...register('role')} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
            <option value="YOUTH">A young person seeking support</option>
            <option value="COUNSELOR">A counselor</option>
            <option value="ORGANIZATION">An organization</option>
          </select>
        </label>
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
    </Shell>
  );
}

export function VerifyEmail() {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const token = new URLSearchParams(location.search).get('token');
  return (
    <Shell title="Verify email">
      {state === 'ok' ? <p className="text-center">Verified! <Link className="text-brand-700" to="/login">Sign in</Link></p> : (
        <Button className="w-full" onClick={() => api.post('/auth/verify-email', { token }).then(() => setState('ok'), () => setState('err'))}>Confirm my email</Button>
      )}
      {state === 'err' && <div className="mt-3"><ErrorState message="This link is invalid or expired." /></div>}
    </Shell>
  );
}

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string }>();
  return (
    <Shell title="Reset your password">
      {sent ? <p className="text-center text-slate-600">If an account exists for that email, a reset link has been sent. <Link className="text-brand-700" to="/login">Back to sign in</Link></p> : (
        <form className="space-y-4" onSubmit={handleSubmit(async (v) => { await api.post('/auth/forgot-password', v).catch(() => {}); setSent(true); })}>
          <Input label="Email" type="email" autoComplete="email" {...register('email', { required: true })} />
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [state, setState] = useState<'idle' | 'ok'>('idle');
  const [err, setErr] = useState('');
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const { register, handleSubmit, formState } = useForm<{ password: string; confirm: string }>();
  if (state === 'ok') return <Shell title="Password updated"><p className="text-center">You can now <Link className="text-brand-700" to="/login">sign in</Link>.</p></Shell>;
  return (
    <Shell title="Choose a new password">
      <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
        setErr('');
        if (v.password !== v.confirm) return setErr('Passwords do not match');
        try { await api.post('/auth/reset-password', { token, password: v.password }); setState('ok'); } catch (e) { setErr(errMsg(e)); }
      })}>
        {err && <ErrorState message={err} />}
        <Input label="New password" type="password" autoComplete="new-password" hint="At least 10 characters" {...register('password', { required: true, minLength: 10 })} />
        <Input label="Confirm password" type="password" autoComplete="new-password" {...register('confirm', { required: true })} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>Update password</Button>
      </form>
    </Shell>
  );
}
