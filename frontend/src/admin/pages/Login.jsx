import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { api, safeNext } from '../../shared/api.js';
import { Field, useForm, useTitle, ErrorNotice, Spinner } from '../../shared/ui/index.jsx';
import { SESSION_KEY, useAdminSession } from '../lib.jsx';
import { BrandMark } from '../layout/Shell.jsx';
import markUrl from '../../shared/brand/mark.png';

export default function Login() {
  useTitle('Sign in', 'MyEnterprise Admin');
  const session = useAdminSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const form = useForm({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (session.data?.admin) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api.post('/admin/auth/login', form.values);
      qc.setQueryData(SESSION_KEY, s);
      navigate(next, { replace: true });
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) form.fromError(err);
      else setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="a-login">
      <div className="a-login__art">
        <div className="row" style={{ '--gap': '10px' }}><BrandMark /><span className="a-brand__name" style={{ color: 'var(--on-dark)' }}>MyEnterprise</span></div>
        <div className="stack" style={{ '--gap': '24px' }}>
          <motion.img src={markUrl} className="a-login__mark" width="112" height="112" alt="" aria-hidden="true"
            initial={reduce ? false : { opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} />
          <h2>Orders, stock and returns for the whole store.</h2>
          <p>Every action here runs through the same database rules as the shop: reservations, the stock ledger and refund limits are checked by triggers and stored procedures.</p>
        </div>
        <p className="small" style={{ color: 'var(--on-dark-muted)' }}>Staff access only.</p>
      </div>
      <div className="a-login__form">
        <motion.form className="a-login__card" onSubmit={submit} noValidate
          initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <div>
            <p className="label" style={{ marginBottom: 8 }}>MyEnterprise Admin</p>
            <h1>Sign in</h1>
          </div>
          {error && <ErrorNotice error={error} />}
          <Field label="Work email" error={form.errors.email}>
            <input className="input" type="email" autoComplete="username" value={form.values.email} onChange={form.set('email')} data-autofocus />
          </Field>
          <Field label="Password" error={form.errors.password}>
            <input className="input" type="password" autoComplete="current-password" value={form.values.password} onChange={form.set('password')} />
          </Field>
          <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
            {busy && <Spinner label="Signing in" />} Sign in to the admin
          </button>
          <p className="small muted">Sessions end after 30 minutes without activity.</p>
        </motion.form>
      </div>
    </div>
  );
}
