import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Users, ShoppingBag } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, number, date, relative, plural } from '../../shared/format.js';
import { ErrorNotice, EmptyState, StatusBadge, useTitle } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, SearchBox, TableSkeleton } from '../components.jsx';
import { initials, useParam } from '../lib.jsx';

export function CustomersList() {
  useTitle('Customers', 'MyEnterprise Admin');
  const navigate = useNavigate();
  const [q, setQ] = useParam('q');
  const query = useQuery({ queryKey: ['admin-customers', q], queryFn: () => api.get('/admin/customers', { q }), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Customers" sub="Registered shoppers, ranked by what they have spent (cancelled orders excluded)." />
      <div className="a-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Name or email" label="Search customers" />
        {query.data && <span className="small muted">{plural(query.data.length, 'customer')}</span>}
      </div>
      <div className="a-panel a-panel--flush" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
        {query.isLoading ? <TableSkeleton cols={6} /> : query.isError ? <div style={{ padding: 16 }}><ErrorNotice error={query.error} onRetry={query.refetch} /></div>
          : query.data.length === 0 ? <EmptyState icon={<Users />} title="No customers match" /> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th scope="col">Customer</th><th scope="col">Since</th><th scope="col" className="num">Orders</th><th scope="col" className="num">Spent</th><th scope="col">Last order</th><th scope="col">Bag</th></tr></thead>
                <tbody>{query.data.map((c) => (
                  <tr key={c.id} className="is-link" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td>
                      <span className="row" style={{ '--gap': '12px', flexWrap: 'nowrap' }}>
                        <span className="a-user__avatar" style={{ background: 'var(--surface)', color: 'var(--ink)' }} aria-hidden="true">{initials(c.name)}</span>
                        <span><Link className="a-link" to={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.name}</Link><div className="small muted">{c.email}</div></span>
                      </span>
                    </td>
                    <td className="small">{date(c.since)}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{money(c.spent)}</td>
                    <td className="small">{c.lastOrder ? relative(c.lastOrder) : <span className="muted">Never</span>}</td>
                    <td>{c.hasCart ? <span className="badge badge--accent">Items waiting</span> : <span className="muted small">—</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['admin-customer', id], queryFn: () => api.get(`/admin/customers/${id}`) });
  useTitle(q.data?.name || 'Customer', 'MyEnterprise Admin');
  if (q.isLoading) return <TableSkeleton />;
  if (q.isError) return <ErrorNotice error={q.error} onRetry={q.refetch} />;
  const c = q.data;
  const live = c.orders.filter((o) => o.status !== 'CANCELLED');
  const spent = live.reduce((s, o) => s + Number(o.total), 0);
  return (
    <>
      <PageHeader back={{ to: '/customers', label: 'Customers' }} title={c.name}
        sub={<><a className="link" href={`mailto:${c.email}`}>{c.email}</a>{c.phone ? ` · ${c.phone}` : ''} · customer since {date(c.since)}</>} />
      <div className="a-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="a-panel a-stat"><span className="a-stat__label">Orders</span><span className="a-stat__value">{number(c.orders.length)}</span></div>
        <div className="a-panel a-stat"><span className="a-stat__label">Spent</span><span className="a-stat__value">{money(spent)}</span></div>
        <div className="a-panel a-stat"><span className="a-stat__label">Average order</span><span className="a-stat__value">{money(live.length ? spent / live.length : 0)}</span></div>
        <div className="a-panel a-stat"><span className="a-stat__label">Return requests</span><span className="a-stat__value">{c.returns}</span></div>
      </div>
      <div className="a-grid a-grid--side a-gap">
        <Panel title="Orders" flush>
          {c.orders.length === 0 ? <EmptyState icon={<ShoppingBag />} title="No orders yet" /> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Status</th><th scope="col" className="num">Items</th><th scope="col" className="num">Total</th></tr></thead>
                <tbody>{c.orders.map((o) => (
                  <tr key={o.id} className="is-link" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td><Link className="a-link" to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link></td>
                    <td className="small">{date(o.placedAt)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="num">{o.units}</td>
                    <td className="num">{money(o.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Shopping bag" sub="The customer's ACTIVE cart">
          {c.cart.length === 0 ? <p className="muted small">The bag is empty.</p> : (
            <ul className="rows small">{c.cart.map((i) => (
              <li key={i.sku} className="row row--between"><span>{i.name}<br /><span className="muted">{i.size} · {i.color} · ×{i.quantity}</span></span><span className="num">{money(Number(i.unitPrice) * i.quantity)}</span></li>
            ))}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
