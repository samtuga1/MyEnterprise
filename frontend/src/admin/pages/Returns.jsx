import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Undo2, Check, X, PackageCheck } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, dateTime, relative, plural } from '../../shared/format.js';
import { Modal, Segmented, ErrorNotice, EmptyState, StatusBadge, ConfirmDialog, useTitle, Spinner } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, Thumb, TableSkeleton, ReadOnly } from '../components.jsx';
import { useAction, useCan, useParam } from '../lib.jsx';

const TABS = [['OPEN', 'Open'], ['REQUESTED', 'Requested'], ['APPROVED', 'Approved'], ['REFUNDED', 'Refunded'], ['REJECTED', 'Declined'], ['ALL', 'All']];

export default function Returns() {
  useTitle('Returns', 'MyEnterprise Admin');
  const [status, setStatus] = useParam('status', 'OPEN');
  const [openId, setOpenId] = useParam('open');
  const q = useQuery({ queryKey: ['admin-returns', status], queryFn: () => api.get('/admin/returns', { status: status === 'ALL' ? '' : status }), placeholderData: (p) => p });
  const [pinned, setPinned] = useState(null); // a return that just left this tab after an action
  const list = q.data || [];
  const selected = list.find((r) => String(r.id) === openId) || (pinned && String(pinned.id) === openId ? pinned : null);

  return (
    <>
      <PageHeader title="Returns" sub="Customers request returns within 30 days of delivery; trigger T2 checks every line. Refunds run sp_complete_return, and trigger T3 caps each refund at what was paid." />
      <div className="a-tabs" style={{ overflowX: 'auto' }}>
        <Segmented label="Return status" layoutId="ret-tab" value={status} onChange={setStatus} options={TABS.map(([value, label]) => ({ value, label }))} />
      </div>
      <div className="a-grid a-grid--side">
        <div className="a-panel a-panel--flush" style={{ opacity: q.isPlaceholderData ? 0.6 : 1, alignSelf: 'start' }}>
          {q.isLoading ? <TableSkeleton cols={5} /> : q.isError ? <div style={{ padding: 16 }}><ErrorNotice error={q.error} onRetry={q.refetch} /></div>
            : list.length === 0 ? <EmptyState icon={<Undo2 />} title="No returns here">Nothing is waiting in this queue.</EmptyState> : (
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead><tr><th scope="col">Return</th><th scope="col">Customer</th><th scope="col">Reason</th><th scope="col">Requested</th><th scope="col" className="num">Value</th><th scope="col">Status</th></tr></thead>
                  <tbody>{list.map((r) => (
                    <tr key={r.id} className={`is-link ${String(r.id) === openId ? 'is-selected' : ''}`} onClick={() => setOpenId(String(r.id))}>
                      <td><button type="button" className="a-link a-mono" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setOpenId(String(r.id))}>{r.reference}</button><div className="small muted">{r.order.number}</div></td>
                      <td>{r.customer}</td>
                      <td className="small">{r.reason}</td>
                      <td className="small" title={dateTime(r.requestedAt)}>{relative(r.requestedAt)}</td>
                      <td className="num">{money(r.value)}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </div>
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <ReturnPanel ret={selected} onChanged={(r) => { setPinned(r); }} />
            </motion.div>
          ) : (
            <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel title="Choose a return"><p className="muted small">Select a return to see its items and act on it.</p></Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function ReturnPanel({ ret, onChanged }) {
  const can = useCan();
  const [confirm, setConfirm] = useState(null);
  const [restock, setRestock] = useState(ret.reason !== 'Arrived damaged');
  const opts = (msg) => ({ invalidate: [['admin-returns'], ['admin-dashboard'], ['admin-order']], success: msg, onSuccess: (d) => { onChanged(d); setConfirm(null); }, onError: () => setConfirm(null) });
  const approve = useAction(() => api.post(`/admin/returns/${ret.id}/approve`), opts('Return approved. Refund it when the parcel arrives.'));
  const reject = useAction(() => api.post(`/admin/returns/${ret.id}/reject`), opts('Return declined.'));
  const complete = useAction(() => api.post(`/admin/returns/${ret.id}/complete`, { restock }), {
    ...opts(), success: (d) => `${money(d.refundTotal)} refunded${restock ? ' and items restocked' : ''}.`,
  });
  const open = ['REQUESTED', 'APPROVED'].includes(ret.status);
  const refunded = ret.items.reduce((s, i) => s + Number(i.refunded), 0);

  return (
    <Panel title={<span className="row" style={{ '--gap': '10px' }}><span className="a-mono">{ret.reference}</span><StatusBadge status={ret.status} /></span>}
      sub={<>Order <Link className="a-link" to={`/orders/${ret.order.id}`}>{ret.order.number}</Link> · {ret.customer}</>}
      foot={open && (
        <div className="btn-row">
          {ret.status === 'REQUESTED' && can.do('reviewReturn') && <button type="button" className="btn btn--primary btn--sm" onClick={() => approve.mutate()} disabled={approve.isPending}>{approve.isPending ? <Spinner /> : <Check size={15} />} Approve</button>}
          {ret.status === 'APPROVED' && can.do('refundReturn') && <button type="button" className="btn btn--primary btn--sm" onClick={() => setConfirm('complete')}><PackageCheck size={15} /> Mark received and refund</button>}
          {can.do('reviewReturn') && <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirm('reject')}><X size={15} /> Decline</button>}
          {!can.do('reviewReturn') && <ReadOnly />}
        </div>
      )}>
      <dl className="a-kv" style={{ marginBottom: 16 }}>
        <dt>Reason</dt><dd>{ret.reason}</dd>
        <dt>Requested</dt><dd>{dateTime(ret.requestedAt)}</dd>
        {ret.resolvedAt && <><dt>Closed</dt><dd>{dateTime(ret.resolvedAt)}</dd></>}
      </dl>
      <ul className="rows">
        {ret.items.map((i) => (
          <li key={i.id} className="a-cell-product">
            <Thumb src={i.image} alt="" />
            <span className="grow"><strong>{i.name}</strong><span className="small">{i.size} · {i.color} · {i.quantity} × {money(i.unitPrice)}</span></span>
            <span className="num small" style={{ textAlign: 'right' }}>{Number(i.refunded) > 0 ? <>Refunded<br /><strong>{money(i.refunded)}</strong></> : <>Refundable<br /><strong>{money(i.refundable)}</strong></>}</span>
          </li>
        ))}
      </ul>
      <div className="a-money" style={{ marginTop: 12 }}>
        <div className="total"><span>Value of returned items</span><span>{money(ret.value)}</span></div>
        {refunded > 0 && <div><span>Refunded</span><span>{money(refunded)}</span></div>}
      </div>

      <Modal open={confirm === 'complete'} onClose={() => setConfirm(null)} title={`Refund ${ret.reference}`}
        description={`Refunds ${money(ret.value)} to the original payment, one simulated refund transaction per line. Trigger T3 refuses anything above the price paid.`}
        footer={<>
          <button type="button" className="btn btn--secondary" onClick={() => setConfirm(null)}>Not yet</button>
          <button type="button" className="btn btn--primary" onClick={() => complete.mutate()} disabled={complete.isPending}>{complete.isPending && <Spinner />} Refund {money(ret.value)}</button>
        </>}>
        <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          <span>Put the {plural(ret.items.reduce((s, i) => s + i.quantity, 0), 'item')} back in stock (a return-restock movement into the warehouse that shipped it). Leave unticked for damaged goods.</span></label>
      </Modal>
      <ConfirmDialog open={confirm === 'reject'} onClose={() => setConfirm(null)} onConfirm={() => reject.mutate()} busy={reject.isPending} danger
        title={`Decline ${ret.reference}?`} confirmLabel="Decline return">
        <p>The customer keeps the items and no refund is made. The declined units can be requested again.</p>
      </ConfirmDialog>
    </Panel>
  );
}

