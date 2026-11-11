import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api.js';
import { ErrorNotice, Field, Skeleton, useForm, useTitle, useToast } from '../../shared/ui/index.jsx';
import { AccountNav } from './Account.jsx';
import { PasswordInput } from './SignIn.jsx';

export default function Settings() {
  useTitle('Your details');
  const qc = useQueryClient();
  const toast = useToast();
  const profile = useQuery({ queryKey: ['account', 'profile'], queryFn: () => api.get('/account') });
  const details = useForm({ firstName: '', lastName: '', phone: '' });
  const pw = useForm({ currentPassword: '', newPassword: '' });

  useEffect(() => {
    if (profile.data) details.setValues({ firstName: profile.data.firstName, lastName: profile.data.lastName, phone: profile.data.phone || '' });
  }, [profile.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (body) => api.patch('/account', body),
    onSuccess: (p) => { qc.setQueryData(['account', 'profile'], p); qc.invalidateQueries({ queryKey: ['session'] }); toast('Your details are saved.'); },
    onError: details.fromError,
  });
  const change = useMutation({
    mutationFn: (body) => api.post('/account/password', body),
    onSuccess: () => { pw.setValues({ currentPassword: '', newPassword: '' }); toast('Your password is changed.'); },
    onError: pw.fromError,
  });

  return (
    <div className="wrap page-pad account">
      <h1 className="page-title">Details and password</h1>
      <div className="account__layout" style={{ marginTop: 24 }}>
        <AccountNav current="settings" />
        <div className="stack" style={{ '--gap': '24px' }}>
          <section className="card card--pad" aria-labelledby="details-h">
            <h2 id="details-h" className="card-title">Your details</h2>
            {profile.isLoading ? <Skeleton height={160} /> : (
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save.mutate(details.values); }} noValidate>
                <Field label="First name" error={details.errors.firstName}><input className="input" autoComplete="given-name" value={details.values.firstName} onChange={details.set('firstName')} /></Field>
                <Field label="Last name" error={details.errors.lastName}><input className="input" autoComplete="family-name" value={details.values.lastName} onChange={details.set('lastName')} /></Field>
                <Field label="Email" hint="Write to customer care to change your email." className="span-2"><input className="input" value={profile.data?.email || ''} readOnly /></Field>
                <Field label="Phone" hint="Optional, for the courier." error={details.errors.phone} className="span-2"><input className="input" type="tel" autoComplete="tel" value={details.values.phone} onChange={details.set('phone')} /></Field>
                <div className="span-2"><button type="submit" className="btn btn--primary" disabled={save.isPending}>{save.isPending && <span className="spinner" />} Save details</button></div>
              </form>
            )}
          </section>
          <section className="card card--pad" aria-labelledby="pw-h">
            <h2 id="pw-h" className="card-title">Password</h2>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); change.mutate(pw.values); }} noValidate>
              <Field label="Current password" error={pw.errors.currentPassword}><PasswordInput value={pw.values.currentPassword} onChange={pw.set('currentPassword')} autoComplete="current-password" /></Field>
              <Field label="New password" hint="At least 8 characters." error={pw.errors.newPassword}><PasswordInput value={pw.values.newPassword} onChange={pw.set('newPassword')} autoComplete="new-password" /></Field>
              {change.error && !Object.keys(change.error.fields || {}).length && <div className="span-2"><ErrorNotice error={change.error} /></div>}
              <div className="span-2"><button type="submit" className="btn btn--secondary" disabled={change.isPending}>{change.isPending && <span className="spinner" />} Change password</button></div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
