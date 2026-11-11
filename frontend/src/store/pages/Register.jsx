import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { productPicture, safeNext } from '../../shared/api.js';
import { ErrorNotice, Field, useForm, useTitle } from '../../shared/ui/index.jsx';
import { useAuthMutation, useSession } from '../hooks.js';
import { AuthLayout, PasswordInput } from './SignIn.jsx';

export default function Register() {
  useTitle('Create an account');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/account');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { values, errors, set, setErrors, fromError } = useForm({ firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const register = useAuthMutation('/auth/register');

  if (session?.customer && !register.isPending && !register.isSuccess) return <Navigate to={next} replace />;

  const submit = (e) => {
    e.preventDefault();
    if (values.password !== values.confirm) {
      setErrors({ confirm: 'The two passwords are different.' });
      return;
    }
    const { confirm, ...body } = values; // eslint-disable-line no-unused-vars
    register.mutate(body, { onSuccess: () => navigate(next, { replace: true }), onError: fromError });
  };
  return (
    <AuthLayout title="Create an account" intro="Your bag comes with you, and every order, return and guarantee claim lives in one place."
      art={productPicture('chunky-rib-turtleneck', 'Burgundy')}>
      <form className="form-grid" onSubmit={submit} noValidate>
        {register.error && !Object.keys(register.error.fields || {}).length && <div className="span-2"><ErrorNotice error={register.error} /></div>}
        <Field label="First name" error={errors.firstName}><input className="input" autoComplete="given-name" value={values.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name" error={errors.lastName}><input className="input" autoComplete="family-name" value={values.lastName} onChange={set('lastName')} /></Field>
        <Field label="Email" error={errors.email} className="span-2"><input className="input" type="email" autoComplete="email" value={values.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password} className="span-2"><PasswordInput value={values.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Repeat the password" error={errors.confirm} className="span-2"><PasswordInput value={values.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
        <button type="submit" className="btn btn--primary btn--lg btn--block span-2" disabled={register.isPending}>
          {register.isPending ? <><span className="spinner" /> Creating your account</> : 'Create account'}
        </button>
      </form>
      <p className="small">Already have an account? <Link className="text-link" to={`/sign-in${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></p>
    </AuthLayout>
  );
}
