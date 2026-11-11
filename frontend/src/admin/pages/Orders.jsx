import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Package, PackageCheck, Truck, XCircle, ShoppingBag, MapPin, CreditCard, Undo2, ShieldCheck } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, date, dateTime, relative, statusLabel, PAYMENT_LABEL, plural } from '../../shared/format.js';
import { Modal, Field, StatusBadge, Pagination, Segmented, ErrorNotice, Skeleton, EmptyState, useTitle, Spinner } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, SearchBox, Thumb, TableSkeleton, ReadOnly } from '../components.jsx';
import { useAction, useCan, useParam } from '../lib.jsx';

const TABS = ['OPEN', 'PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'ALL'];
const TAB_LABEL = { OPEN: 'Open', ALL: 'All' };

export function OrdersList() {
  useTitle('Orders', 'MyEnterprise Admin');
  const navigate = useNavigate();
  const [status, setStatus] = useParam('status', 'OPEN');
  const [q, setQ] = useParam('q');
  const [page, setPage] = useParam('page', '1');
  const query = useQuery({
    queryKey: ['admin-orders', status, q, page],
    queryFn: () => api.get('/admin/orders', { status: status === 'ALL' ? '' : status, q, page }),
    placeholderData: (prev) => prev,
  });
  const counts = query.data?.counts || {};
  const countOf = (s) => (s === 'ALL' ? Object.values(counts).reduce((a, b) => a + b, 0)
    : s === 'OPEN' ? (counts.PLACED || 0) + (counts.PROCESSING || 0) + (counts.SHIPPED || 0) : counts[s] || 0);

  return (
    <>
      <PageHeader title="Orders" sub="Paid orders move from placed to packed, shipped and delivered. Each step runs a stored procedure." />
      <div className="a-tabs" style={{ overflowX: 'auto' }}>
        <Segmented label="Order status" layoutId="orders-tab" value={status} onChange={setStatus}
          options={TABS.map((s) => ({ value: s, label: TAB_LABEL[s] || statusLabel(s), count: query.data ? countOf(s) : undefined }))} />
      </div>
      <div className="a-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Order number, customer or email" label="Search orders" /></div>
      <div className="a-panel a-panel--flush" style={{ opacity: query.isPlaceholderData ? 0.6 : 1, transition: 'opacity 200ms' }}>
        {query.isLoading ? <TableSkeleton cols={7} /> : query.isError ? <div style={{ padding: 16 }}><ErrorNotice error={query.error} onRetry={query.refetch} /></div> : (
          query.data.items.length === 0 ? <EmptyState icon={<ShoppingBag />} title="No orders match">Try another status or search.</EmptyState> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr>
                  <th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Delivery</th>
                  <th scope="col" className="num">Items</th><th scope="col">Placed</th><th scope="col" className="num">Total</th><th scope="col" className="num">Refunded</th>
                </tr></thead>
                <tbody>
                  {query.data.items.map((o) => (
                    <tr key={o.id} className="is-link" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td><Link className="a-link" to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link></td>
                      <td><div>{o.customer.name}</div><div className="small muted">{o.customer.email}</div></td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="small">{o.delivery === 'EXPRESS' ? 'Express' : 'Standard'}</td>
                      <td className="num">{o.units}</td>
                      <td className="small" title={dateTime(o.placedAt)}>{relative(o.placedAt)}</td>
                      <td className="num">{money(o.total)}</td>
                      <td className="num">{Number(o.refunded) > 0 ? money(o.refunded) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      {query.data && <Pagination page={query.data.page} pages={query.data.pages} onChange={(p) => setPage(String(p))} />}
    </>
  );
}

/* ----------------------------------------------------------------- detail */
const STEPS = [['PLACED', 'Placed'], ['PROCESSING', 'Packing'], ['SHIPPED', 'Shipped'], ['DELIVERED', 'Delivered']];
const ORDER_RANK = { PLACED: 1, PROCESSING: 2, SHIPPED: 3, DELIVERED: 4, CANCELLED: 0 };

function Progress({ status }) {
  const reduce = useReducedMotion();
  const rank = ORDER_RANK[status] ?? 0;
  return (
    <div className="a-steps" aria-label={`Progress: ${statusLabel(status)}`}>
      {STEPS.map(([s, label], i) => {
        const done = status !== 'CANCELLED' && rank >= i + 1;
        return (
          <div key={s} className={`a-step ${done ? 'is-done' : ''} ${status === 'CANCELLED' ? 'is-cancelled' : ''}`}>
            <span className="a-step__bar">
              {done && <motion.span initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} />}
            </span>
            <span>{status === 'CANCELLED' && i === 0 ? 'Cancelled' : label}</span>
          </div>
        );
      })}
    </div>
  );
}

const CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL'];
const ALLOC_LABEL = { RESERVED: 'reserved', SHIPPED: 'shipped', RELEASED: 'released' };

export function OrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const key = ['admin-order', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/admin/orders/${id}`) });
  const o = q.data;
  useTitle(o ? o.number : 'Order', 'MyEnterprise Admin');
  const [shipOpen, setShipOpen] = useState(false);
  const [carrier, setCarrier] = useState('UPS');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState();
  const after = { invalidate: [['admin-orders'], ['admin-dashboard']], onSuccess: (data) => data && qc.setQueryData(key, data) };

  const start = useAction(() => api.post(`/admin/orders/${id}/start`), { ...after, success: 'Packing started. You are the packer on this order.' });
  const ship = useAction(() => api.post(`/admin/orders/${id}/ship`, { carrier }), {
    ...after,
    success: (d) => `Shipped in ${plural(d.parcelsCreated, 'parcel')} with ${carrier}.`,
    onSuccess: (d) => { qc.setQueryData(key, d); setShipOpen(false); },
  });
  const deliver = useAction((shipmentId) => api.post(`/admin/shipments/${shipmentId}/deliver`), {
    ...after, success: (d) => (d.status === 'DELIVERED' ? 'Last parcel delivered — the order is complete.' : 'Parcel marked as delivered.'),
  });
  const cancel = useAction(() => api.post(`/admin/orders/${id}/cancel`, { reason }), {
    ...after, success: (d) => `Order cancelled. ${money(d.refunded)} refunded and ${plural(d.released, 'unit')} back in stock.`,
    onSuccess: (d) => { qc.setQueryData(key, d); setCancelOpen(false); setReason(''); },
    onError: (err) => setReasonError(err.fields?.reason),
  });

  if (q.isLoading) return <><Skeleton width={180} height={14} /><Skeleton width={320} height={40} style={{ margin: '12px 0 24px' }} /><TableSkeleton /></>;
  if (q.isError) return <ErrorNotice error={q.error} onRetry={q.refetch} />;

  const open = ['PLACED', 'PROCESSING'].includes(o.status);
  const actions = (
    <>
      {o.status === 'PLACED' && can.do('fulfil') && (
        <button type="button" className="btn btn--secondary" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? <Spinner /> : <Package size={17} />} Start packing
        </button>
      )}
      {open && can.do('fulfil') && <button type="button" className="btn btn--primary" onClick={() => setShipOpen(true)}><Truck size={17} /> Ship order</button>}
      {open && can.do('cancelOrder') && <button type="button" className="btn btn--danger" onClick={() => setCancelOpen(true)}><XCircle size={17} /> Cancel</button>}
      {open && !can.do('fulfil') && !can.do('cancelOrder') && <ReadOnly />}
    </>
  );

  return (
    <>
      <PageHeader back={{ to: '/orders', label: 'Orders' }} title={o.number}
        sub={<>Placed {dateTime(o.placedAt)} by <Link className="a-link" to={`/customers/${o.customer.id}`}>{o.customer.name}</Link> · <StatusBadge status={o.status} /></>}
        actions={actions} />
      <Progress status={o.status} />

      <div className="a-grid a-grid--side">
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Items" sub={`${plural(o.items.reduce((s, i) => s + i.quantity, 0), 'unit')} · stock reserved by warehouse at checkout`} flush>
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th scope="col">Item</th><th scope="col">From warehouse</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Price</th><th scope="col" className="num">Line</th></tr></thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div className="a-cell-product">
                          <Thumb src={i.image} alt="" />
                          <span><strong>{i.name}</strong><span className="small">{i.size} · {i.color} · <span className="a-mono">{i.sku}</span></span></span>
                        </div>
                      </td>
                      <td>
                        <div className="a-alloc">
                          {i.allocations.map((a, n) => (
                            <span key={n} className={`a-chip ${a.status === 'RESERVED' ? 'a-chip--accent' : ''}`} title={statusLabel(a.status)}>
                              {a.warehouse} × {a.quantity} · {ALLOC_LABEL[a.status] || a.status.toLowerCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">{money(i.unitPrice)}</td>
                      <td className="num">{money(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Parcels" sub={o.shipments.length ? 'One parcel per warehouse (sp_ship_order)' : 'Created when the order ships'}>
            {o.shipments.length === 0 ? <p className="muted">Nothing has shipped yet.</p> : o.shipments.map((s) => (
              <div className="a-parcel" key={s.id}>
                <span className="a-parcel__icon">{s.status === 'DELIVERED' ? <PackageCheck size={18} /> : <Truck size={18} />}</span>
                <div>
                  <div><strong className="a-mono" style={{ fontSize: 13.5 }}>{s.tracking}</strong> <span className="muted small">· {s.carrier} · {s.warehouse} · {plural(s.units, 'unit')}</span></div>
                  <div className="small muted">Shipped {dateTime(s.shippedAt)}{s.deliveredAt ? ` · delivered ${dateTime(s.deliveredAt)}` : ''}</div>
                </div>
                {s.status === 'IN_TRANSIT' && can.do('fulfil') ? (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => deliver.mutate(s.id)} disabled={deliver.isPending}>Mark delivered</button>
                ) : <StatusBadge status={s.status} />}
              </div>
            ))}
          </Panel>

          {(o.returns.length > 0 || o.claims.length > 0) && (
            <Panel title="After-sales">
              <div className="rows">
                {o.returns.map((r) => (
                  <div key={`r${r.id}`} className="row row--between">
                    <span className="row"><Undo2 size={16} /> <Link className="a-link" to={`/returns?status=ALL&open=${r.id}`}>{r.reference}</Link> <span className="muted small">{r.reason} · {date(r.requestedAt)}</span></span>
                    <span className="row">{Number(r.refunded) > 0 && <span className="small num">{money(r.refunded)}</span>}<StatusBadge status={r.status} /></span>
                  </div>
                ))}
                {o.claims.map((c) => (
                  <div key={`c${c.id}`} className="row row--between">
                    <span className="row"><ShieldCheck size={16} /> <Link className="a-link" to="/claims?status=ALL">{c.reference}</Link> <span className="muted small">{c.reason}</span></span>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Payment ledger" sub="Simulated card transactions; no card details are stored" flush>
            <table className="a-table a-table--compact">
              <thead><tr><th scope="col">Type</th><th scope="col">Reference</th><th scope="col">When</th><th scope="col">Result</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>{o.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.type === 'CAPTURE' ? 'Payment' : 'Refund'}</td>
                  <td className="a-mono">{t.reference}</td>
                  <td className="small">{dateTime(t.at)}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="num">{t.type === 'REFUND' ? '−' : ''}{money(t.amount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </Panel>
        </div>

        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Money">
            <div className="a-money">
              <div><span>Items</span><span>{money(o.money.subtotal)}</span></div>
              <div><span>Delivery ({o.shipping.method === 'EXPRESS' ? 'express' : 'standard'})</span><span>{Number(o.money.shipping) ? money(o.money.shipping) : 'Free'}</span></div>
              <div className="total"><span>Total paid</span><span>{money(o.money.total)}</span></div>
              {Number(o.money.refunded) > 0 && <div><span>Refunded</span><span>−{money(o.money.refunded)}</span></div>}
              <div className="small muted"><span><CreditCard size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {PAYMENT_LABEL[o.money.paymentMethod] || o.money.paymentMethod}</span><StatusBadge status={o.money.paymentStatus} /></div>
            </div>
          </Panel>
          <Panel title="Customer" actions={<Link className="text-link small" to={`/customers/${o.customer.id}`}>Profile</Link>}>
            <dl className="a-kv">
              <dt>Name</dt><dd>{o.customer.name}</dd>
              <dt>Email</dt><dd><a className="link" href={`mailto:${o.customer.email}`}>{o.customer.email}</a></dd>
              {o.customer.phone && <><dt>Phone</dt><dd>{o.customer.phone}</dd></>}
            </dl>
          </Panel>
          <Panel title="Ship to">
            <p style={{ display: 'flex', gap: 10 }}><MapPin size={16} style={{ flex: 'none', marginTop: 4 }} />
              <span>{o.shipping.recipient}<br />{o.shipping.line1}<br />{o.shipping.city}, {o.shipping.region} {o.shipping.postalCode}<br />{o.shipping.country}</span></p>
          </Panel>
          <Panel title="Fulfillment">
            <dl className="a-kv">
              <dt>Status</dt><dd><StatusBadge status={o.fulfillment.status} /></dd>
              <dt>Packer</dt><dd>{o.fulfillment.packer || <span className="muted">Unassigned</span>}</dd>
              <dt>Record</dt><dd className="a-mono">Fulfillment #{o.fulfillment.id}</dd>
            </dl>
          </Panel>
          {o.cancellation && (
            <Panel title="Cancellation">
              <dl className="a-kv">
                <dt>When</dt><dd>{dateTime(o.cancellation.at)}</dd>
                <dt>By</dt><dd>{o.cancellation.by === 'ADMIN' ? `Staff — ${o.cancellation.staff}` : 'The customer'}</dd>
                <dt>Reason</dt><dd>{o.cancellation.reason}</dd>
              </dl>
            </Panel>
          )}
        </div>
      </div>

      <Modal open={shipOpen} onClose={() => setShipOpen(false)} title="Ship this order"
        description="Each warehouse holding a reservation sends its own parcel with a tracking number. Reserved units leave stock through the ledger."
        footer={<>
          <button type="button" className="btn btn--secondary" onClick={() => setShipOpen(false)}>Not yet</button>
          <button type="button" className="btn btn--primary" onClick={() => ship.mutate()} disabled={ship.isPending}>{ship.isPending && <Spinner />} Ship with {carrier}</button>
        </>}>
        <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ marginBottom: 8 }}>Carrier</legend>
          {CARRIERS.map((c) => (
            <label key={c} className="choice__option">
              <input type="radio" name="carrier" value={c} checked={carrier === c} onChange={() => setCarrier(c)} />
              <span className="choice__body"><span className="choice__title">{c}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="small muted" style={{ marginTop: 12 }}>
          Warehouses: {[...new Set(o.items.flatMap((i) => i.allocations.filter((a) => a.status === 'RESERVED').map((a) => a.warehouse)))].join(', ') || '—'}
        </p>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${o.number}?`}
        description="Reserved stock goes back to its warehouses and the full payment is refunded. This cannot be undone."
        footer={<>
          <button type="button" className="btn btn--secondary" onClick={() => setCancelOpen(false)}>Keep the order</button>
          <button type="button" className="btn btn--danger" disabled={cancel.isPending}
            onClick={() => { if (reason.trim().length < 3) { setReasonError('Give a reason of at least 3 characters.'); return; } setReasonError(undefined); cancel.mutate(); }}>
            {cancel.isPending && <Spinner />} Cancel and refund
          </button>
        </>}>
        <Field label="Reason (shown on the order)" error={reasonError}>
          <textarea className="textarea" value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }} placeholder="For example: customer asked us to cancel before packing" />
        </Field>
      </Modal>
    </>
  );
}
