import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck, PackageCheck, XCircle, Trash2, Pencil, Lightbulb, Building2 } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, number, date, dateTime, plural, REASON_LABEL } from '../../shared/format.js';
import { Field, Modal, useForm, Segmented, ErrorNotice, EmptyState, StatusBadge, ConfirmDialog, useTitle, Spinner, Skeleton } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, SearchBox, TableSkeleton, ReadOnly } from '../components.jsx';
import { useAction, useCan, useParam, useDebounced } from '../lib.jsx';
import { useWarehouses } from './Inventory.jsx';

const useSuppliers = () => useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api.get('/admin/suppliers'), staleTime: 30_000 });
const INVALIDATE = [['admin-pos'], ['admin-po'], ['admin-suppliers'], ['admin-inventory'], ['admin-warehouses'], ['admin-movements'], ['admin-dashboard'], ['admin-suggestions']];

export function Purchasing() {
  useTitle('Purchasing', 'MyEnterprise Admin');
  const can = useCan();
  const [tab, setTab] = useParam('tab', 'orders');
  return (
    <>
      <PageHeader title="Purchasing" sub="Suppliers, their price lists, and purchase orders. Receiving an order runs sp_receive_purchase_order — a cursor writes one stock movement per line, exactly once."
        actions={can.do('procurement') ? <Link className="btn btn--primary" to="/purchasing/new"><Plus size={17} /> New purchase order</Link> : <ReadOnly />} />
      <div className="a-tabs">
        <Segmented label="Purchasing view" layoutId="po-tab" value={tab} onChange={setTab}
          options={[{ value: 'orders', label: 'Purchase orders' }, { value: 'suggestions', label: 'Suggested reorders' }, { value: 'suppliers', label: 'Suppliers' }]} />
      </div>
      {tab === 'suppliers' ? <Suppliers /> : tab === 'suggestions' ? <Suggestions /> : <PurchaseOrders />}
    </>
  );
}

function PurchaseOrders() {
  const navigate = useNavigate();
  const [status, setStatus] = useParam('status', 'ORDERED');
  const q = useQuery({ queryKey: ['admin-pos', status], queryFn: () => api.get('/admin/purchase-orders', { status: status === 'ALL' ? '' : status }), placeholderData: (p) => p });
  return (
    <>
      <div className="a-toolbar">
        <Segmented label="Purchase order status" layoutId="po-status" value={status} onChange={setStatus}
          options={[{ value: 'ORDERED', label: 'Awaiting delivery' }, { value: 'RECEIVED', label: 'Received' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'ALL', label: 'All' }]} />
      </div>
      <div className="a-panel a-panel--flush" style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
        {q.isLoading ? <TableSkeleton cols={8} /> : q.isError ? <div style={{ padding: 16 }}><ErrorNotice error={q.error} onRetry={q.refetch} /></div>
          : q.data.length === 0 ? <EmptyState icon={<Truck />} title="No purchase orders here" /> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr>
                  <th scope="col">Order</th><th scope="col">Supplier</th><th scope="col">Deliver to</th><th scope="col" className="num">Lines</th><th scope="col" className="num">Units</th>
                  <th scope="col" className="num">Value</th><th scope="col">Ordered</th><th scope="col">{status === 'RECEIVED' ? 'Received' : 'Expected'}</th><th scope="col">Status</th>
                </tr></thead>
                <tbody>
                  {q.data.map((po) => (
                    <tr key={po.id} className="is-link" onClick={() => navigate(`/purchasing/orders/${po.id}`)}>
                      <td><Link className="a-link a-mono" to={`/purchasing/orders/${po.id}`} onClick={(e) => e.stopPropagation()}>{po.reference}</Link></td>
                      <td>{po.supplier}</td>
                      <td className="small">{po.warehouse}</td>
                      <td className="num">{po.lines}</td>
                      <td className="num">{number(po.units)}</td>
                      <td className="num">{money(po.value)}</td>
                      <td className="small">{date(po.orderedAt)}</td>
                      <td className="small">{po.receivedAt ? date(po.receivedAt) : po.status === 'ORDERED' ? <span style={{ color: new Date(po.expectedAt) < new Date() ? 'var(--warn)' : undefined }}>{date(po.expectedAt)}</span> : '—'}</td>
                      <td><StatusBadge status={po.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

function Suggestions() {
  const navigate = useNavigate();
  const can = useCan();
  const q = useQuery({ queryKey: ['admin-suggestions'], queryFn: () => api.get('/admin/purchase-orders/suggestions') });
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of q.data || []) {
      const k = `${r.warehouseId}-${r.supplierId}`;
      if (!map.has(k)) map.set(k, { warehouseId: r.warehouseId, warehouse: r.warehouse, supplierId: r.supplierId, supplier: r.supplier || 'No supplier offer', rows: [] });
      map.get(k).rows.push(r);
    }
    return [...map.values()];
  }, [q.data]);
  if (q.isLoading) return <TableSkeleton />;
  if (q.isError) return <ErrorNotice error={q.error} onRetry={q.refetch} />;
  if (!groups.length) return <EmptyState icon={<Lightbulb />} title="Nothing to reorder">Every stock line is above its reorder level once open purchase orders arrive.</EmptyState>;
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <p className="small muted measure">Lines whose available stock plus units already on order is at or under the reorder level. The cheapest supplier offer is chosen, as in business query Q3.</p>
      {groups.map((g) => (
        <Panel key={`${g.warehouseId}-${g.supplierId}`} title={`${g.supplier} → ${g.warehouse}`} sub={`${plural(g.rows.length, 'line')} · about ${money(g.rows.reduce((s, r) => s + (r.suggested || 0) * Number(r.unitCost || 0), 0))}`} flush
          actions={can.do('procurement') && g.supplierId && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/purchasing/new', {
              state: { supplierId: g.supplierId, warehouseId: g.warehouseId, items: g.rows.map((r) => ({ variantId: r.variantId, sku: r.sku, name: r.name, size: r.size, color: r.color, unitCost: r.unitCost, minimumOrder: r.minimumOrder, leadDays: r.leadDays, quantity: r.suggested })) },
            })}><Plus size={15} /> Draft purchase order</button>
          )}>
          <div className="a-table-wrap">
            <table className="a-table a-table--compact">
              <thead><tr><th scope="col">Item</th><th scope="col" className="num">Available</th><th scope="col" className="num">Reorder at</th><th scope="col" className="num">On order</th><th scope="col" className="num">Unit cost</th><th scope="col" className="num">Lead</th><th scope="col" className="num">Suggested</th></tr></thead>
              <tbody>{g.rows.map((r) => (
                <tr key={r.variantId}>
                  <td>{r.name} <span className="small muted">{r.size} · {r.color} · <span className="a-mono">{r.sku}</span></span></td>
                  <td className="num">{r.available}</td><td className="num">{r.reorderLevel}</td><td className="num">{r.onOrder}</td>
                  <td className="num">{r.unitCost ? money(r.unitCost) : '—'}</td><td className="num">{r.leadDays ? `${r.leadDays} d` : '—'}</td>
                  <td className="num"><strong style={{ fontWeight: 600 }}>{r.suggested ?? '—'}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Suppliers() {
  const navigate = useNavigate();
  const can = useCan();
  const q = useSuppliers();
  const [adding, setAdding] = useState(false);
  const form = useForm({ name: '', contact: '' });
  const create = useAction((v) => api.post('/admin/suppliers', v), {
    invalidate: [['admin-suppliers']], success: 'Supplier added. Add the variants they sell to their price list.',
    onSuccess: (d) => { setAdding(false); navigate(`/purchasing/suppliers/${d.id}`); }, onError: form.fromError,
  });
  return (
    <>
      {can.do('procurement') && <div className="a-toolbar"><button type="button" className="btn btn--secondary" onClick={() => { form.setValues({ name: '', contact: '' }); setAdding(true); }}><Plus size={16} /> New supplier</button></div>}
      <div className="a-panel a-panel--flush">
        {q.isLoading ? <TableSkeleton /> : q.isError ? <div style={{ padding: 16 }}><ErrorNotice error={q.error} onRetry={q.refetch} /></div> : (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th scope="col">Supplier</th><th scope="col">Contact</th><th scope="col" className="num">Variants offered</th><th scope="col" className="num">Avg. lead time</th><th scope="col" className="num">Open orders</th><th scope="col" className="num">Total spend</th></tr></thead>
              <tbody>{q.data.map((s) => (
                <tr key={s.id} className="is-link" onClick={() => navigate(`/purchasing/suppliers/${s.id}`)}>
                  <td><span className="row" style={{ '--gap': '10px' }}><Building2 size={16} className="muted" aria-hidden="true" /><Link className="a-link" to={`/purchasing/suppliers/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link></span></td>
                  <td className="small">{s.contact}</td>
                  <td className="num">{s.offers}</td>
                  <td className="num">{s.avgLeadDays !== null ? `${s.avgLeadDays} days` : '—'}</td>
                  <td className="num">{s.openOrders}</td>
                  <td className="num">{money(s.spend)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="New supplier"
        footer={<><button type="button" className="btn btn--secondary" onClick={() => setAdding(false)}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={create.isPending} onClick={() => create.mutate(form.values)}>{create.isPending && <Spinner />} Add supplier</button></>}>
        <div className="stack">
          <Field label="Company name" error={form.errors.name}><input className="input" value={form.values.name} onChange={form.set('name')} data-autofocus /></Field>
          <Field label="Orders email" error={form.errors.contact}><input className="input" type="email" value={form.values.contact} onChange={form.set('contact')} /></Field>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------ supplier */
export function SupplierDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const key = ['admin-supplier', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/admin/suppliers/${id}`) });
  useTitle(q.data?.name || 'Supplier', 'MyEnterprise Admin');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  if (q.isLoading) return <TableSkeleton />;
  if (q.isError) return <ErrorNotice error={q.error} onRetry={q.refetch} />;
  const s = q.data;
  const rows = s.offers.filter((o) => !filter || `${o.name} ${o.sku} ${o.color}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <PageHeader back={{ to: '/purchasing?tab=suppliers', label: 'Suppliers' }} title={s.name} sub={<><a className="link" href={`mailto:${s.contact}`}>{s.contact}</a> · {plural(s.offers.length, 'variant')} on the price list (SupplierProduct)</>}
        actions={can.do('procurement') ? <>
          <button type="button" className="btn btn--secondary" onClick={() => setEditing({ isNew: true })}><Plus size={16} /> Add to price list</button>
          <Link className="btn btn--primary" to="/purchasing/new" state={{ supplierId: s.id }}><Plus size={16} /> Purchase order</Link>
        </> : <ReadOnly />} />
      <div className="a-toolbar"><label className="a-search"><span className="sr-only">Filter price list</span><input className="input" type="search" placeholder="Filter by product, SKU or colour" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ paddingLeft: 14 }} /></label></div>
      <div className="a-panel a-panel--flush">
        <div className="a-table-wrap">
          <table className="a-table a-table--compact">
            <thead><tr><th scope="col">Item</th><th scope="col">SKU</th><th scope="col" className="num">Unit cost</th><th scope="col" className="num">Retail price</th><th scope="col" className="num">Margin</th><th scope="col" className="num">Lead time</th><th scope="col" className="num">Minimum</th><th scope="col"><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.variantId}>
                <td>{o.name} <span className="small muted">{o.size} · {o.color}</span></td>
                <td className="a-mono">{o.sku}</td>
                <td className="num">{money(o.unitCost)}</td>
                <td className="num">{money(o.price)}</td>
                <td className="num">{Math.round((1 - Number(o.unitCost) / Number(o.price)) * 100)}%</td>
                <td className="num">{o.leadDays} d</td>
                <td className="num">{o.minimumOrder}</td>
                <td className="num">{can.do('procurement') && <button type="button" className="btn btn--quiet btn--sm" onClick={() => setEditing(o)} aria-label={`Edit offer for ${o.sku}`}><Pencil size={14} /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {editing && <OfferDialog supplierId={s.id} offer={editing} onClose={() => setEditing(null)} onSaved={(d) => { qc.setQueryData(key, d); setEditing(null); }} />}
    </>
  );
}

function OfferDialog({ supplierId, offer, onClose, onSaved }) {
  const [variant, setVariant] = useState(offer.isNew ? null : offer);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const found = useQuery({ queryKey: ['admin-variants', term], queryFn: () => api.get('/admin/variants', { q: term }), enabled: offer.isNew && term.length > 1 });
  const form = useForm({ unitCost: offer.unitCost || '', leadDays: offer.leadDays ? String(offer.leadDays) : '14', minimumOrder: offer.minimumOrder ? String(offer.minimumOrder) : '6' });
  const save = useAction((v) => api.put(`/admin/suppliers/${supplierId}/offers/${variant.variantId ?? variant.id}`, { unitCost: v.unitCost, leadDays: Number(v.leadDays), minimumOrder: Number(v.minimumOrder) }), {
    invalidate: [['admin-suppliers'], ['admin-suggestions']], success: 'Price list updated.', onSuccess: onSaved, onError: form.fromError,
  });
  return (
    <Modal open onClose={onClose} title={offer.isNew ? 'Add to price list' : `Offer for ${offer.sku}`}
      footer={<><button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn--primary" disabled={!variant || save.isPending} onClick={() => save.mutate(form.values)}>{save.isPending && <Spinner />} Save offer</button></>}>
      <div className="stack">
        {offer.isNew && !variant && (
          <>
            <Field label="Find a variant" hint="Type a product name or SKU"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} data-autofocus /></Field>
            <ul className="rows" style={{ maxHeight: 240, overflow: 'auto' }}>
              {(found.data || []).map((v) => (
                <li key={v.id}><button type="button" className="btn btn--quiet btn--sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setVariant(v)}>
                  {v.name} · {v.size} · {v.color} <span className="a-mono muted">{v.sku}</span></button></li>
              ))}
            </ul>
          </>
        )}
        {variant && <p className="small"><strong>{variant.name}</strong> · {variant.size} · {variant.color} <span className="a-mono muted">{variant.sku}</span></p>}
        <div className="form-grid">
          <Field label="Unit cost (USD)" error={form.errors.unitCost}><input className="input" inputMode="decimal" value={form.values.unitCost} onChange={form.set('unitCost')} /></Field>
          <Field label="Lead time (days)" error={form.errors.leadDays}><input className="input" inputMode="numeric" value={form.values.leadDays} onChange={form.set('leadDays')} /></Field>
          <Field label="Minimum order" error={form.errors.minimumOrder}><input className="input" inputMode="numeric" value={form.values.minimumOrder} onChange={form.set('minimumOrder')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------- purchase order page */
export function PurchaseOrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const key = ['admin-po', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/admin/purchase-orders/${id}`) });
  const po = q.data;
  useTitle(po?.reference || 'Purchase order', 'MyEnterprise Admin');
  const [confirm, setConfirm] = useState(null);
  const receive = useAction(() => api.post(`/admin/purchase-orders/${id}/receive`), {
    invalidate: INVALIDATE,
    success: (d) => `Received ${plural(d.received.lines, 'line')}, ${plural(d.received.units, 'unit')}. Trigger T1 added them to ${d.warehouse}.`,
    onSuccess: (d) => { qc.setQueryData(key, d); setConfirm(null); }, onError: () => setConfirm(null),
  });
  const cancel = useAction(() => api.post(`/admin/purchase-orders/${id}/cancel`), {
    invalidate: INVALIDATE, success: 'Purchase order cancelled.', onSuccess: (d) => { qc.setQueryData(key, d); setConfirm(null); }, onError: () => setConfirm(null),
  });
  if (q.isLoading) return <><Skeleton width={260} height={40} /><div className="a-gap"><TableSkeleton /></div></>;
  if (q.isError) return <ErrorNotice error={q.error} onRetry={q.refetch} />;
  const units = po.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <>
      <PageHeader back={{ to: '/purchasing', label: 'Purchasing' }} title={po.reference}
        sub={<>{po.supplier} → {po.warehouse} · ordered {dateTime(po.orderedAt)} · <StatusBadge status={po.status} /></>}
        actions={po.status === 'ORDERED' && (can.do('procurement') ? <>
          <button type="button" className="btn btn--danger" onClick={() => setConfirm('cancel')}><XCircle size={17} /> Cancel order</button>
          <button type="button" className="btn btn--primary" onClick={() => setConfirm('receive')}><PackageCheck size={17} /> Receive delivery</button>
        </> : <ReadOnly />)} />
      <div className="a-grid a-grid--side">
        <Panel title="Lines" sub={`${plural(po.items.length, 'line')} · ${plural(units, 'unit')}`} flush foot={<div className="row row--between"><span>Order value</span><strong className="num">{money(po.total)}</strong></div>}>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th scope="col">Item</th><th scope="col">SKU</th><th scope="col" className="num">Quantity</th><th scope="col" className="num">Unit cost</th><th scope="col" className="num">Line</th><th scope="col" className="num">On hand now</th></tr></thead>
              <tbody>{po.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name} <span className="small muted">{i.size} · {i.color}</span></td>
                  <td className="a-mono">{i.sku}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{money(i.unitCost)}</td>
                  <td className="num">{money(i.lineTotal)}</td>
                  <td className="num">{i.onHand}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Details">
            <dl className="a-kv">
              <dt>Supplier</dt><dd>{po.supplier}<br /><a className="link small" href={`mailto:${po.contact}`}>{po.contact}</a></dd>
              <dt>Deliver to</dt><dd>{po.warehouse}</dd>
              <dt>Ordered</dt><dd>{dateTime(po.orderedAt)}</dd>
              <dt>Received</dt><dd>{po.receivedAt ? dateTime(po.receivedAt) : <span className="muted">Not yet</span>}</dd>
            </dl>
          </Panel>
          <Panel title="Stock ledger" sub={po.movements.length ? `${plural(po.movements.length, 'movement')} with reference ${po.reference}` : 'Movements appear when the delivery is received'}>
            {po.movements.length === 0 ? <p className="small muted">Receiving runs CURSOR 2 over these lines and inserts one {REASON_LABEL.PURCHASE_RECEIPT.toLowerCase()} row each. A second receive is refused.</p> : (
              <ul className="rows small">{po.movements.map((m) => {
                const item = po.items.find((i) => i.variantId === m.variantId);
                return <li key={m.id} className="row row--between"><span><span className="a-mono muted">#{m.id}</span> {item?.sku}</span><span className="num" style={{ color: 'var(--ok)', fontWeight: 600 }}>+{m.change}</span></li>;
              })}</ul>
            )}
          </Panel>
        </div>
      </div>
      <ConfirmDialog open={confirm === 'receive'} onClose={() => setConfirm(null)} onConfirm={() => receive.mutate()} busy={receive.isPending}
        title={`Receive ${po.reference}?`} confirmLabel="Receive into stock">
        <p>{plural(units, 'unit')} on {plural(po.items.length, 'line')} will be added to {po.warehouse}. This can only happen once.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'cancel'} onClose={() => setConfirm(null)} onConfirm={() => cancel.mutate()} busy={cancel.isPending} danger
        title={`Cancel ${po.reference}?`} confirmLabel="Cancel purchase order">
        <p>The supplier is no longer expected to deliver. Nothing is added to stock.</p>
      </ConfirmDialog>
    </>
  );
}

/* ------------------------------------------------------- new purchase order */
export function NewPurchaseOrder() {
  useTitle('New purchase order', 'MyEnterprise Admin');
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state || {};
  const suppliers = useSuppliers();
  const warehouses = useWarehouses();
  const [supplierId, setSupplierId] = useState(prefill.supplierId ? String(prefill.supplierId) : '');
  const [warehouseId, setWarehouseId] = useState(prefill.warehouseId ? String(prefill.warehouseId) : '1');
  const [lines, setLines] = useState(prefill.items || []);
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 250);
  const [errors, setErrors] = useState({});
  const firstSupplier = useRef(supplierId);
  useEffect(() => {
    // Lines belong to one supplier's price list: switching supplier starts over.
    if (supplierId !== firstSupplier.current) { setLines([]); firstSupplier.current = supplierId; }
  }, [supplierId]);
  const offers = useQuery({ queryKey: ['admin-variants', supplierId, term], queryFn: () => api.get('/admin/variants', { q: term, supplier: supplierId }), enabled: !!supplierId });
  const add = (v) => {
    if (lines.some((l) => l.variantId === v.id)) return;
    setLines([...lines, { variantId: v.id, sku: v.sku, name: v.name, size: v.size, color: v.color, unitCost: v.unitCost, minimumOrder: v.minimumOrder, leadDays: v.leadDays, quantity: v.minimumOrder || 1 }]);
  };
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * Number(l.unitCost || 0), 0);
  const create = useAction(() => api.post('/admin/purchase-orders', { supplierId: Number(supplierId), warehouseId: Number(warehouseId), items: lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity) })) }), {
    invalidate: INVALIDATE, success: (d) => `${d.reference} sent to ${d.supplier}.`, onSuccess: (d) => navigate(`/purchasing/orders/${d.id}`, { replace: true }),
    onError: (e) => setErrors(e.fields || {}),
  });

  return (
    <>
      <PageHeader back={{ to: '/purchasing', label: 'Purchasing' }} title="New purchase order" sub="Costs come from the supplier's price list; the server checks each minimum order quantity." />
      <div className="a-grid a-grid--side">
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Supplier and destination">
            <div className="form-grid">
              <Field label="Supplier" error={errors.supplierId}>
                <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Choose a supplier</option>
                  {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Deliver to" error={errors.warehouseId}>
                <select className="select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {(warehouses.data || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            </div>
          </Panel>
          <Panel title="Lines" flush sub={errors.items || (lines.length ? `${plural(lines.length, 'line')}` : 'Add items from the price list')}>
            {lines.length === 0 ? <p className="muted" style={{ padding: 20 }}>No lines yet.</p> : (
              <div className="a-table-wrap">
                <table className="a-table a-table--compact">
                  <thead><tr><th scope="col">Item</th><th scope="col" className="num">Unit cost</th><th scope="col" className="num">Minimum</th><th scope="col" className="num">Quantity</th><th scope="col" className="num">Line</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
                  <tbody>{lines.map((l, i) => (
                    <tr key={l.variantId}>
                      <td>{l.name} <span className="small muted">{l.size} · {l.color} · <span className="a-mono">{l.sku}</span></span>
                        {errors[`items.${i}`] && <div className="field__error">{errors[`items.${i}`]}</div>}</td>
                      <td className="num">{money(l.unitCost)}</td>
                      <td className="num">{l.minimumOrder ?? '—'}</td>
                      <td className="num"><input className="input a-inline-input a-inline-input--sm" inputMode="numeric" aria-label={`Quantity of ${l.sku}`} value={l.quantity}
                        onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, '') } : x)))} /></td>
                      <td className="num">{money((Number(l.quantity) || 0) * Number(l.unitCost || 0))}</td>
                      <td className="num"><button type="button" className="btn btn--quiet btn--icon btn--sm" aria-label={`Remove ${l.sku}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={15} /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Total">
            <div className="a-money"><div className="total"><span>Order value</span><span>{money(total)}</span></div></div>
            <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} disabled={!supplierId || !lines.length || create.isPending} onClick={() => { setErrors({}); create.mutate(); }}>
              {create.isPending && <Spinner />} Send purchase order
            </button>
          </Panel>
          <Panel title="Price list" sub={supplierId ? 'Click an item to add it' : 'Choose a supplier first'}>
            {!supplierId && <p className="small muted">The items this supplier sells, with their cost, minimum order and lead time, appear here.</p>}
            {supplierId && (
              <>
                <label className="field"><span className="sr-only">Search the price list</span>
                  <input className="input" type="search" placeholder="Product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
                <ul className="rows" style={{ maxHeight: 420, overflow: 'auto', marginTop: 8 }}>
                  {offers.isLoading && <li><Skeleton height={14} /></li>}
                  {(offers.data || []).map((v) => {
                    const added = lines.some((l) => l.variantId === v.id);
                    return (
                      <li key={v.id}>
                        <button type="button" className="btn btn--quiet btn--sm" disabled={added} onClick={() => add(v)} style={{ width: '100%', justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left', minHeight: 52, lineHeight: 1.4, padding: '6px 12px' }}>
                          <span>{v.name} · {v.size} · {v.color}<br /><span className="small muted">{money(v.unitCost)} · min {v.minimumOrder} · {v.leadDays} days</span></span>
                          {added ? <span className="small muted">Added</span> : <Plus size={15} />}
                        </button>
                      </li>
                    );
                  })}
                  {offers.data && offers.data.length === 0 && <li className="small muted">Nothing on this price list matches.</li>}
                </ul>
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
