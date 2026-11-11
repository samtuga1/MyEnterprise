import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Boxes, SlidersHorizontal, History, Warehouse } from 'lucide-react';
import { api } from '../../shared/api.js';
import { number, dateTime, REASON_LABEL } from '../../shared/format.js';
import { Field, Modal, useForm, Pagination, Segmented, ErrorNotice, EmptyState, useTitle, Spinner, Skeleton } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, SearchBox, Thumb, TableSkeleton, ReadOnly } from '../components.jsx';
import { CapacityMeter } from '../charts.jsx';
import { useAction, useCan, useParam } from '../lib.jsx';

export function useWarehouses() {
  return useQuery({ queryKey: ['admin-warehouses'], queryFn: () => api.get('/admin/warehouses'), staleTime: 30_000 });
}

const INVALIDATE = [['admin-inventory'], ['admin-warehouses'], ['admin-movements'], ['admin-dashboard']];

export default function Inventory() {
  useTitle('Inventory', 'MyEnterprise Admin');
  const [tab, setTab] = useParam('tab', 'stock');
  const [warehouse, setWarehouse] = useParam('warehouse');
  const wh = useWarehouses();

  return (
    <>
      <PageHeader title="Inventory" sub="Balances per warehouse. On-hand stock changes only through the stock ledger: each movement row is applied to Inventory by trigger T1." />
      <div className="a-grid a-grid--3">
        {wh.isLoading ? [0, 1, 2].map((i) => <div key={i} className="a-panel" style={{ padding: 20 }}><Skeleton height={60} /></div>)
          : wh.isError ? <ErrorNotice error={wh.error} onRetry={wh.refetch} /> : wh.data.map((w) => (
            <div key={w.id} className="a-panel" style={{ padding: 20, display: 'grid', gap: 12, boxShadow: String(w.id) === warehouse ? '0 0 0 2px var(--accent)' : undefined }}>
              <span className="row row--between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="row" style={{ '--gap': '10px', flexWrap: 'nowrap', alignItems: 'flex-start' }}><Warehouse size={18} aria-hidden="true" style={{ marginTop: 3 }} /><span><strong style={{ fontWeight: 600 }}>{w.name}</strong><span className="small muted" style={{ display: 'block' }}>{w.location}</span></span></span>
                <button type="button" className="btn btn--quiet btn--sm" aria-pressed={String(w.id) === warehouse} onClick={() => setWarehouse(String(w.id) === warehouse ? '' : String(w.id))}>
                  {String(w.id) === warehouse ? 'Show all' : 'Show only'}
                </button>
              </span>
              <CapacityMeter name="Capacity used" capacity={w.capacity} onHand={w.onHand} reserved={w.reserved} />
              <span className="small muted">{number(w.skus)} stock lines · {number(w.reserved)} reserved · <span style={{ color: w.low ? 'var(--warn)' : undefined }}>{w.low} low</span></span>
            </div>
          ))}
      </div>
      <div className="a-tabs a-gap">
        <Segmented label="View" layoutId="inv-tab" value={tab} onChange={setTab}
          options={[{ value: 'stock', label: 'Stock balances' }, { value: 'movements', label: 'Stock ledger' }]} />
      </div>
      {tab === 'movements' ? <Movements warehouses={wh.data || []} /> : <Stock warehouses={wh.data || []} />}
    </>
  );
}

function Stock({ warehouses }) {
  const can = useCan();
  const [q, setQ] = useParam('q');
  const [warehouse, setWarehouse] = useParam('warehouse');
  const [low, setLow] = useParam('low');
  const [page, setPage] = useParam('page', '1');
  const query = useQuery({ queryKey: ['admin-inventory', warehouse, q, low, page], queryFn: () => api.get('/admin/inventory', { warehouse, q, low, page }), placeholderData: (p) => p });
  const [adjusting, setAdjusting] = useState(null);
  const [reorder, setReorder] = useState(null);

  return (
    <>
      <div className="a-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Product, SKU or colour" label="Search stock" />
        <label className="sr-only" htmlFor="inv-wh">Warehouse</label>
        <select id="inv-wh" className="select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={low === '1'} onChange={(e) => setLow(e.target.checked ? '1' : '')} /> At or under reorder level</label>
        {query.data && <span className="small muted">{number(query.data.total)} stock lines</span>}
        {!can.do('inventory') && <ReadOnly />}
      </div>
      <div className="a-panel a-panel--flush" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
        {query.isLoading ? <TableSkeleton cols={8} /> : query.isError ? <div style={{ padding: 16 }}><ErrorNotice error={query.error} onRetry={query.refetch} /></div>
          : query.data.items.length === 0 ? <EmptyState icon={<Boxes />} title="No stock lines match" /> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr>
                  <th scope="col">Item</th><th scope="col">Warehouse</th><th scope="col" className="num">On hand</th><th scope="col" className="num">Reserved</th>
                  <th scope="col" className="num">Available</th><th scope="col" className="num">Reorder at</th><th scope="col" className="num">On order</th><th scope="col"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {query.data.items.map((r) => {
                    const lowRow = r.available <= r.reorderLevel;
                    return (
                      <tr key={`${r.warehouseId}-${r.variantId}`} className={r.isActive ? '' : 'muted-row'}>
                        <td><div className="a-cell-product"><Thumb src={r.image} /><span><Link className="a-link" to={`/products/${r.productId}`}><strong>{r.name}</strong></Link><span className="small">{r.size} · {r.color} · <span className="a-mono">{r.sku}</span></span></span></div></td>
                        <td className="small">{r.warehouse}</td>
                        <td className="num">{r.onHand}</td>
                        <td className="num">{r.reserved || <span className="muted">0</span>}</td>
                        <td className="num"><span className="row" style={{ '--gap': '6px', justifyContent: 'flex-end' }}>{lowRow && <span className={`a-dot ${r.available <= 0 ? 'a-dot--danger' : 'a-dot--warn'}`} aria-label="Low stock" />}<strong style={{ fontWeight: lowRow ? 600 : 400 }}>{r.available}</strong></span></td>
                        <td className="num">
                          {can.do('inventory') ? <button type="button" className="btn btn--quiet btn--sm" onClick={() => setReorder(r)} aria-label={`Change reorder level for ${r.sku} in ${r.warehouse}`}>{r.reorderLevel}</button> : r.reorderLevel}
                        </td>
                        <td className="num">{r.onOrder ? <Link className="a-link" to="/purchasing?status=ORDERED">{r.onOrder}</Link> : <span className="muted">—</span>}</td>
                        <td className="num">{can.do('inventory') && <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdjusting(r)}><SlidersHorizontal size={14} /> Adjust</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {query.data && <Pagination page={query.data.page} pages={query.data.pages} onChange={(p) => setPage(String(p))} />}
      {adjusting && <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />}
      {reorder && <ReorderDialog row={reorder} onClose={() => setReorder(null)} />}
    </>
  );
}

function AdjustDialog({ row, onClose }) {
  const form = useForm({ change: '', reason: 'ADJUSTMENT', note: '' });
  const adjust = useAction((v) => api.post('/admin/inventory/adjust', { warehouseId: row.warehouseId, variantId: row.variantId, change: Number(v.change), reason: v.reason, note: v.note }), {
    invalidate: INVALIDATE, success: (d) => `Movement #${d.movementId} recorded. ${row.sku} now has ${d.onHand} on hand.`, onSuccess: onClose, onError: form.fromError,
  });
  const change = Number(form.values.change) || 0;
  return (
    <Modal open onClose={onClose} title={`Adjust ${row.sku}`}
      description={`${row.name} · ${row.size} · ${row.color} in ${row.warehouse}. This writes a row to the stock ledger (StockMovement); trigger T1 updates the balance and refuses to go below the ${row.reserved} units reserved for customers.`}
      footer={<>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn--primary" disabled={adjust.isPending} onClick={() => adjust.mutate(form.values)}>{adjust.isPending && <Spinner />} Record movement</button>
      </>}>
      <div className="form-grid">
        <Field label="Change in units" hint="Positive adds, negative removes" error={form.errors.change}>
          <input className="input" inputMode="numeric" value={form.values.change} onChange={form.set('change')} placeholder="-2 or 5" data-autofocus />
        </Field>
        <Field label="Reason" error={form.errors.reason}>
          <select className="select" value={form.values.reason} onChange={form.set('reason')}>
            <option value="ADJUSTMENT">Count correction</option>
            <option value="DAMAGE_WRITE_OFF">Damaged, write off</option>
          </select>
        </Field>
        <Field className="span-2" label="Note (optional)" hint="Stored as the movement's reference, up to 50 characters" error={form.errors.note}>
          <input className="input" maxLength={50} value={form.values.note} onChange={form.set('note')} placeholder="Recount after delivery" />
        </Field>
      </div>
      <div className="a-money" style={{ marginTop: 16 }}>
        <div><span>On hand now</span><span>{row.onHand}</span></div>
        <div><span>Reserved for orders</span><span>{row.reserved}</span></div>
        <div className="total"><span>On hand after</span><span style={{ color: row.onHand + change < row.reserved ? 'var(--danger)' : undefined }}>{row.onHand + change}</span></div>
      </div>
    </Modal>
  );
}

function ReorderDialog({ row, onClose }) {
  const form = useForm({ reorderLevel: String(row.reorderLevel) });
  const save = useAction((v) => api.post('/admin/inventory/reorder-level', { warehouseId: row.warehouseId, variantId: row.variantId, reorderLevel: Number(v.reorderLevel) }), {
    invalidate: INVALIDATE, success: 'Reorder level saved.', onSuccess: onClose, onError: form.fromError,
  });
  return (
    <Modal open onClose={onClose} title="Reorder level" description={`${row.sku} in ${row.warehouse}. When available stock falls to this number the line shows as low and is suggested for a purchase order.`}
      footer={<>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate(form.values)}>{save.isPending && <Spinner />} Save level</button>
      </>}>
      <Field label="Reorder at (units available)" error={form.errors.reorderLevel}>
        <input className="input" inputMode="numeric" value={form.values.reorderLevel} onChange={form.set('reorderLevel')} data-autofocus />
      </Field>
    </Modal>
  );
}

const REASONS = Object.keys(REASON_LABEL);

function Movements({ warehouses }) {
  const [q, setQ] = useParam('q');
  const [warehouse, setWarehouse] = useParam('warehouse');
  const [reason, setReason] = useParam('reason');
  const [page, setPage] = useParam('page', '1');
  const query = useQuery({ queryKey: ['admin-movements', warehouse, reason, q, page], queryFn: () => api.get('/admin/inventory/movements', { warehouse, reason, q, page }), placeholderData: (p) => p });
  return (
    <>
      <div className="a-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="SKU, product or reference (PO-12, ME-10057)" label="Search the ledger" />
        <label className="sr-only" htmlFor="mv-wh">Warehouse</label>
        <select id="mv-wh" className="select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="mv-reason">Reason</label>
        <select id="mv-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Every reason</option>
          {REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
        </select>
        {query.data && <span className="small muted">{number(query.data.total)} movements</span>}
      </div>
      <div className="a-panel a-panel--flush" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
        {query.isLoading ? <TableSkeleton cols={6} /> : query.isError ? <div style={{ padding: 16 }}><ErrorNotice error={query.error} onRetry={query.refetch} /></div>
          : query.data.items.length === 0 ? <EmptyState icon={<History />} title="No movements match" /> : (
            <div className="a-table-wrap">
              <table className="a-table a-table--compact">
                <thead><tr><th scope="col">#</th><th scope="col">When</th><th scope="col">Item</th><th scope="col">Warehouse</th><th scope="col">Reason</th><th scope="col">Reference</th><th scope="col" className="num">Change</th></tr></thead>
                <tbody>
                  {query.data.items.map((m) => (
                    <tr key={m.id}>
                      <td className="a-mono muted">{m.id}</td>
                      <td className="small">{dateTime(m.at)}</td>
                      <td><span>{m.name}</span> <span className="small muted">{m.size} · {m.color} · <span className="a-mono">{m.sku}</span></span></td>
                      <td className="small">{m.warehouse}</td>
                      <td className="small">{REASON_LABEL[m.reason] || m.reason}</td>
                      <td className="a-mono">{m.reference || '—'}</td>
                      <td className="num" style={{ color: m.change > 0 ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{m.change > 0 ? `+${m.change}` : `−${Math.abs(m.change)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {query.data && <Pagination page={query.data.page} pages={query.data.pages} onChange={(p) => setPage(String(p))} />}
    </>
  );
}
