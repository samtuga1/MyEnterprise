import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { productPicture, safeNext } from '../../shared/api.js';
import { ErrorNotice, Field, ProductImage, useForm, useTitle } from '../../shared/ui/index.jsx';
import { useAuthMutation, useSession } from '../hooks.js';

export function AuthLayout({ title, intro, children, art = productPicture('everyday-trench-coat', 'Sand') }) {
  return (
    <div className="auth">
      <div className="auth__art frame"><ProductImage src={art} alt="" eager /></div>
      <div className="auth__panel">
        <div className="auth__inner">
          <h1 className="page-title">{title}</h1>
          {intro && <p className="muted">{intro}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, id, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <span className="password">
      <input {...rest} id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} />
      <button type="button" className="password__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}

export default function SignIn() {
  useTitle('Sign in');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/account');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { values, errors, set, fromError } = useForm({ email: '', password: '' });
  const login = useAuthMutation('/auth/login');

  if (session?.customer && !login.isPending && !login.isSuccess) return <Navigate to={next} replace />;

  const submit = (e) => {
    e.preventDefault();
    login.mutate(values, { onSuccess: () => navigate(next, { replace: true }), onError: fromError });
  };
  return (
    <AuthLayout title="Sign in" intro="Track orders, start returns and check out faster.">
      <form className="stack" style={{ '--gap': '18px' }} onSubmit={submit} noValidate>
        {login.error && !Object.keys(login.error.fields || {}).length && <ErrorNotice error={login.error} />}
        <Field label="Email" error={errors.email}><input className="input" type="email" autoComplete="email" value={values.email} onChange={set('email')} data-autofocus /></Field>
        <Field label="Password" error={errors.password}><PasswordInput value={values.password} onChange={set('password')} autoComplete="current-password" /></Field>
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={login.isPending}>
          {login.isPending ? <><span className="spinner" /> Signing in</> : 'Sign in'}
        </button>
      </form>
      <p className="small">New here? <Link className="text-link" to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p>
    </AuthLayout>
  );
}
