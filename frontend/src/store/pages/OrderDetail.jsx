import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, Package, RotateCcw, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, date, dateTime, PAYMENT_LABEL, statusLabel } from '../../shared/format.js';
import { EmptyState, ErrorNotice, Field, Modal, ProductImage, Skeleton, StatusBadge, useForm, useTitle, useToast, EASE_ENTER } from '../../shared/ui/index.jsx';
import { AccountNav } from './Account.jsx';

const STAGES = [['PLACED', 'Placed', Check], ['PROCESSING', 'Packing', Package], ['SHIPPED', 'Shipped', Truck], ['DELIVERED', 'Delivered', Check]];
const RETURN_REASONS = ['Too small', 'Too large', 'Colour differs from the photos', 'Fabric feels thinner than expected', 'Changed my mind', 'Arrived damaged'];

function Timeline({ status }) {
  const reduce = useReducedMotion();
  const index = STAGES.findIndex(([s]) => s === status);
  const pct = index < 0 ? 0 : (index / (STAGES.length - 1)) * 100;
  return (
    <div className="timeline" aria-label={`Order status: ${statusLabel(status)}`}>
      <div className="timeline__track"><motion.span className="timeline__fill" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ duration: 0.9, ease: EASE_ENTER, delay: 0.15 }} /></div>
      <ol className="timeline__steps">
        {STAGES.map(([code, label, Icon], i) => (
          <li key={code} className={`timeline__step ${i <= index ? 'is-done' : ''} ${i === index ? 'is-now' : ''}`}>
            <motion.span className="timeline__dot" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.3 }}>
              <Icon size={14} />
            </motion.span>
            <span className="timeline__label">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CancelDialog({ open, onClose, order }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('Ordered the wrong size.');
  const m = useMutation({
    mutationFn: () => api.post(`/account/orders/${order.number}/cancel`, { reason }),
    onSuccess: (o) => { qc.setQueryData(['account', 'order', order.number], o); qc.invalidateQueries({ queryKey: ['account', 'orders'] }); toast(`Order ${order.number} is cancelled. ${money(o.money.refunded)} is on its way back to you.`); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title="Cancel this order?"
      footer={<><button type="button" className="btn btn--secondary" onClick={onClose}>Keep the order</button>
        <button type="button" className="btn btn--danger" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending && <span className="spinner" />} Cancel the order</button></>}>
      <div className="stack">
        <p>Nothing has been packed yet. The {money(order.money.total)} you paid goes straight back to your {PAYMENT_LABEL[order.money.paymentMethod]?.toLowerCase() || 'card'}.</p>
        <Field label="Reason">
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {['Ordered the wrong size.', 'Found a colour I prefer.', 'Ordered twice by mistake.', 'Changed my mind.'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <ErrorNotice error={m.error} />
      </div>
    </Modal>
  );
}

function ReturnDialog({ open, onClose, order }) {
  const qc = useQueryClient();
  const toast = useToast();
  const items = order.items.filter((i) => i.canReturn);
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const chosen = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ orderItemId: Number(id), quantity: q }));
  const value = chosen.reduce((s, c) => s + c.quantity * Number(order.items.find((i) => i.id === c.orderItemId).unitPrice), 0);
  const m = useMutation({
    mutationFn: () => api.post(`/account/orders/${order.number}/returns`, { reason, items: chosen }),
    onSuccess: (res) => { qc.setQueryData(['account', 'order', order.number], res.order); toast(`Return ${res.reference} is requested. Its status updates here once our team reviews it.`); setQty({}); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title="Return items" wide
      description="Choose what you are sending back. Refunds use the price you paid; delivery is not refunded."
      footer={<><button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn--primary" disabled={!chosen.length || m.isPending} onClick={() => m.mutate()}>
          {m.isPending && <span className="spinner" />} Request return{value ? ` · ${money(value)}` : ''}
        </button></>}>
      <div className="stack">
        <ul className="return-pick">
          {items.map((i) => (
            <li key={i.id}>
              <span className="summary__thumb frame frame--45"><ProductImage src={i.image} alt="" /></span>
              <span className="grow"><strong>{i.name}</strong><br /><span className="small muted">{i.color} · {i.size} · return by {date(i.returnUntil)}</span></span>
              <label className="sr-only" htmlFor={`rq-${i.id}`}>Quantity to return of {i.name}</label>
              <select id={`rq-${i.id}`} className="select select--sm" style={{ width: 92 }} value={qty[i.id] || 0} onChange={(e) => setQty((s) => ({ ...s, [i.id]: Number(e.target.value) }))}>
                {Array.from({ length: i.returnable + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <Field label="Why are you returning them?">
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <ErrorNotice error={m.error} />
      </div>
    </Modal>
  );
}

function ClaimDialog({ open, onClose, order }) {
  const qc = useQueryClient();
  const toast = useToast();
  const items = order.items.filter((i) => i.warranty?.canClaim);
  const { values, errors, set, fromError } = useForm({ orderItemId: items[0]?.id || '', reason: '' });
  const m = useMutation({
    mutationFn: () => api.post(`/account/orders/${order.number}/claims`, { orderItemId: Number(values.orderItemId), reason: values.reason }),
    onSuccess: (res) => { qc.setQueryData(['account', 'order', order.number], res.order); toast(`Claim ${res.reference} is with our care team.`); onClose(); },
    onError: fromError,
  });
  return (
    <Modal open={open} onClose={onClose} title="Quality guarantee claim"
      description="For seams, zips, soles or hardware that failed in normal wear. For fit, start a return instead."
      footer={<><button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn--primary" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending && <span className="spinner" />} Send claim</button></>}>
      <div className="stack">
        <Field label="Item" error={errors.orderItemId}>
          <select className="select" value={values.orderItemId} onChange={set('orderItemId')}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.color}, {i.size} (covered until {date(i.warranty.endsOn)})</option>)}
          </select>
        </Field>
        <Field label="What is wrong?" hint="At least 10 characters, e.g. “The sole is separating at the toe.”" error={errors.reason}>
          <textarea className="textarea" value={values.reason} onChange={set('reason')} maxLength={255} />
        </Field>
        {m.error && !Object.keys(m.error.fields || {}).length && <ErrorNotice error={m.error} />}
      </div>
    </Modal>
  );
}

export default function OrderDetail() {
  const { number } = useParams();
  useTitle(`Order ${number}`);
  const [dialog, setDialog] = useState(null);
  const { data: order, isLoading, error, refetch } = useQuery({ queryKey: ['account', 'order', number], queryFn: () => api.get(`/account/orders/${number}`) });

  return (
    <div className="wrap page-pad account">
      <Link to="/account" className="text-link row small"><ArrowLeft size={16} /> All orders</Link>
      <div className="account__layout" style={{ marginTop: 24 }}>
        <AccountNav current="orders" />
        <div>
          {isLoading ? <Skeleton height={420} radius={20} /> : error ? (
            error.status === 404
              ? <EmptyState icon={<Package />} title="Order not found" action={<Link className="btn btn--primary" to="/account">See your orders</Link>}>This order is not on your account.</EmptyState>
              : <ErrorNotice error={error} onRetry={refetch} />
          ) : (
            <div className="stack" style={{ '--gap': '28px' }}>
              <header className="order-head">
                <div>
                  <h1 className="page-title num">{order.number}</h1>
                  <p className="muted">Placed {dateTime(order.placedAt)} · {money(order.money.total)}</p>
                </div>
                <StatusBadge status={order.status} />
              </header>

              {order.status === 'CANCELLED' ? (
                <div className="notice"><XCircle size={18} /> <div>Cancelled {date(order.cancellation?.at)}{order.cancellation?.by === 'ADMIN' ? ' by our team' : ''}: {order.cancellation?.reason} {money(order.money.refunded)} refunded.</div></div>
              ) : <Timeline status={order.status} />}

              {(order.can.cancel || order.can.return || order.can.claim) && (
                <div className="btn-row">
                  {order.can.return && <button type="button" className="btn btn--primary" onClick={() => setDialog('return')}><RotateCcw size={17} /> Return items</button>}
                  {order.can.claim && <button type="button" className="btn btn--secondary" onClick={() => setDialog('claim')}><ShieldCheck size={17} /> Report a quality problem</button>}
                  {order.can.cancel && <button type="button" className="btn btn--danger" onClick={() => setDialog('cancel')}><XCircle size={17} /> Cancel order</button>}
                </div>
              )}

              <section className="card card--pad" aria-labelledby="items-h">
                <h2 id="items-h" className="card-title">Items</h2>
                <ul className="order-items">
                  {order.items.map((i) => (
                    <li key={i.id}>
                      <Link to={`/product/${i.slug}?color=${encodeURIComponent(i.color)}`} className="summary__thumb frame frame--45 m-zoom"><ProductImage src={i.image} alt={`${i.name} in ${i.color}`} /></Link>
                      <div className="grow">
                        <p className="summary__name">{i.name}</p>
                        <p className="small muted">{i.color} · {i.size} · {i.quantity} × {money(i.unitPrice)}</p>
                        <p className="small muted">
                          {i.canReturn && <>Return by {date(i.returnUntil)}. </>}
                          {i.warranty?.endsOn && <>Guaranteed until {date(i.warranty.endsOn)}.</>}
                        </p>
                      </div>
                      <span className="price">{money(i.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {order.shipments.length > 0 && (
                <section className="card card--pad" aria-labelledby="parcels-h">
                  <h2 id="parcels-h" className="card-title">{order.shipments.length === 1 ? 'Parcel' : `${order.shipments.length} parcels`}</h2>
                  <ul className="rows">
                    {order.shipments.map((s) => (
                      <li key={s.id} className="row row--between">
                        <span><strong>{s.carrier}</strong> <span className="num muted">{s.tracking}</span><br /><span className="small muted">From {s.warehouse} · {s.units} {s.units === 1 ? 'item' : 'items'} · shipped {date(s.shippedAt)}</span></span>
                        <StatusBadge status={s.status} label={s.deliveredAt ? `Delivered ${date(s.deliveredAt)}` : 'In transit'} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(order.returns.length > 0 || order.claims.length > 0) && (
                <section className="card card--pad" aria-labelledby="after-h">
                  <h2 id="after-h" className="card-title">Returns and claims</h2>
                  <ul className="rows">
                    {order.returns.map((r) => (
                      <li key={`r${r.id}`} className="row row--between">
                        <span><strong>{r.reference}</strong> · {r.reason}<br /><span className="small muted">Requested {date(r.requestedAt)}{Number(r.refunded) > 0 ? ` · ${money(r.refunded)} refunded` : ''}</span></span>
                        <StatusBadge status={r.status} />
                      </li>
                    ))}
                    {order.claims.map((c) => (
                      <li key={`c${c.id}`} className="row row--between">
                        <span><strong>{c.reference}</strong> · {c.reason}<br /><span className="small muted">Sent {date(c.submittedAt)}{c.resolution ? ` · ${c.resolution}` : ''}</span></span>
                        <StatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="order-grid">
                <section className="card card--pad" aria-labelledby="addr-h">
                  <h2 id="addr-h" className="card-title">Delivery</h2>
                  <p>{order.shipping.recipient}<br />{order.shipping.line1}<br />{order.shipping.city}, {order.shipping.region} {order.shipping.postalCode}</p>
                  <p className="small muted" style={{ marginTop: 8 }}>{order.shipping.method === 'EXPRESS' ? 'Express' : 'Standard'} delivery</p>
                </section>
                <section className="card card--pad" aria-labelledby="pay-h">
                  <h2 id="pay-h" className="card-title">Payment</h2>
                  <dl className="summary__rows">
                    <div><dt>Items</dt><dd className="price">{money(order.money.subtotal)}</dd></div>
                    <div><dt>Delivery</dt><dd className="price">{Number(order.money.shipping) ? money(order.money.shipping) : 'Free'}</dd></div>
                    <div className="summary__total"><dt>Paid with {PAYMENT_LABEL[order.money.paymentMethod] || 'card'}</dt><dd className="price">{money(order.money.total)}</dd></div>
                    {Number(order.money.refunded) > 0 && <div><dt>Refunded</dt><dd className="price">−{money(order.money.refunded)}</dd></div>}
                  </dl>
                </section>
              </div>

              <CancelDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} order={order} />
              {order.can.return && <ReturnDialog open={dialog === 'return'} onClose={() => setDialog(null)} order={order} />}
              {order.can.claim && <ClaimDialog open={dialog === 'claim'} onClose={() => setDialog(null)} order={order} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
