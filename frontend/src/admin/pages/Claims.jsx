import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Check, X, BadgeCheck } from 'lucide-react';
import { api } from '../../shared/api.js';
import { date, relative } from '../../shared/format.js';
import { Field, Modal, Segmented, ErrorNotice, EmptyState, StatusBadge, useTitle, Spinner } from '../../shared/ui/index.jsx';
import { PageHeader, Thumb, TableSkeleton, ReadOnly } from '../components.jsx';
import { useAction, useCan, useParam } from '../lib.jsx';

const TABS = [['OPEN', 'Open'], ['SUBMITTED', 'Submitted'], ['APPROVED', 'Approved'], ['RESOLVED', 'Resolved'], ['REJECTED', 'Declined'], ['ALL', 'All']];
const SUGGESTED = {
  resolve: ['Replacement sent.', 'Repaired by our partner workshop.', 'Refund issued as store credit.'],
  reject: ['Wear and tear is not covered by the guarantee.', 'Damage caused by incorrect care.', 'Submitted after the guarantee ended.'],
};

export default function Claims() {
  useTitle('Quality claims', 'MyEnterprise Admin');
  const can = useCan();
  const [status, setStatus] = useParam('status', 'OPEN');
  const q = useQuery({ queryKey: ['admin-claims', status], queryFn: () => api.get('/admin/claims', { status: status === 'ALL' ? '' : status }), placeholderData: (p) => p });
  const [deciding, setDeciding] = useState(null); // { claim, action }
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState();
  const decide = useAction(({ claim, action }) => api.post(`/admin/claims/${claim.id}/${action}`, { resolution }), {
    invalidate: [['admin-claims'], ['admin-dashboard'], ['admin-order']],
    success: (d) => (d.status === 'APPROVED' ? 'Claim approved.' : d.status === 'RESOLVED' ? 'Claim resolved.' : 'Claim declined.'),
    onSuccess: () => { setDeciding(null); setResolution(''); },
    onError: (e) => setError(e.fields?.resolution),
  });
  const start = (claim, action) => {
    if (action === 'approve') { decide.mutate({ claim, action }); return; }
    setResolution(''); setError(undefined); setDeciding({ claim, action });
  };

  return (
    <>
      <PageHeader title="Quality claims" sub="The guarantee starts on delivery and lasts the variant's guarantee period. Trigger T5 only accepts claims on the exact variant bought, inside that period, one open claim per item." />
      <div className="a-tabs" style={{ overflowX: 'auto' }}>
        <Segmented label="Claim status" layoutId="claim-tab" value={status} onChange={setStatus} options={TABS.map(([value, label]) => ({ value, label }))} />
      </div>
      <div className="a-panel a-panel--flush" style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
        {q.isLoading ? <TableSkeleton cols={6} /> : q.isError ? <div style={{ padding: 16 }}><ErrorNotice error={q.error} onRetry={q.refetch} /></div>
          : q.data.length === 0 ? <EmptyState icon={<ShieldCheck />} title="No claims here" /> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr>
                  <th scope="col">Claim</th><th scope="col">Item and customer</th><th scope="col">Problem</th><th scope="col">Submitted</th>
                  <th scope="col">Guarantee</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>{q.data.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="a-mono">{c.reference}</span><div className="small"><Link className="a-link" to={`/orders/${c.order.id}`}>{c.order.number}</Link></div></td>
                    <td><div className="a-cell-product"><Thumb src={c.image} /><span><strong>{c.product}</strong><span className="small">{c.size} · {c.color} · {c.customer}</span></span></div></td>
                    <td className="wrap-text small">{c.reason}{c.resolution && <div className="muted" style={{ marginTop: 4 }}>→ {c.resolution}</div>}</td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{relative(c.submittedAt)}</td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      <span className={`badge ${c.eligible ? 'badge--ok' : 'badge--danger'}`}>{c.eligible ? 'Eligible' : 'Outside guarantee'}</span>
                      <div className="muted" style={{ marginTop: 4 }}>{c.months} months · until {c.coveredUntil ? date(c.coveredUntil) : '—'}</div>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      {['SUBMITTED', 'APPROVED'].includes(c.status) && (can.do('decideClaim') ? (
                        <div className="a-actions">
                          {c.status === 'SUBMITTED' && <button type="button" className="btn btn--secondary btn--sm" onClick={() => start(c, 'approve')} disabled={decide.isPending}><Check size={14} /> Approve</button>}
                          {c.status === 'APPROVED' && <button type="button" className="btn btn--primary btn--sm" onClick={() => start(c, 'resolve')}><BadgeCheck size={14} /> Resolve</button>}
                          <button type="button" className="btn btn--quiet btn--sm" onClick={() => start(c, 'reject')} aria-label={`Decline ${c.reference}`}><X size={14} /> Decline</button>
                        </div>
                      ) : <ReadOnly>View only</ReadOnly>)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
      </div>
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.action === 'resolve' ? `Resolve ${deciding?.claim.reference}` : `Decline ${deciding?.claim.reference}`}
        description={deciding?.claim.reason}
        footer={<>
          <button type="button" className="btn btn--secondary" onClick={() => setDeciding(null)}>Cancel</button>
          <button type="button" className={`btn ${deciding?.action === 'reject' ? 'btn--danger' : 'btn--primary'}`} disabled={decide.isPending}
            onClick={() => { if (resolution.trim().length < 3) { setError('Describe what was decided (3 characters or more).'); return; } decide.mutate(deciding); }}>
            {decide.isPending && <Spinner />} {deciding?.action === 'reject' ? 'Decline claim' : 'Resolve claim'}
          </button>
        </>}>
        <Field label="What was decided (the customer sees this)" error={error}>
          <textarea className="textarea" value={resolution} onChange={(e) => { setResolution(e.target.value); setError(undefined); }} data-autofocus />
        </Field>
        <div className="row" style={{ marginTop: 10, '--gap': '6px' }}>
          {(SUGGESTED[deciding?.action] || []).map((s) => <button type="button" key={s} className="btn btn--secondary btn--sm" onClick={() => setResolution(s)}>{s}</button>)}
        </div>
      </Modal>
    </>
  );
}
