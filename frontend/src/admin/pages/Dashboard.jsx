import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus, Undo2, ShieldCheck, Truck, AlertTriangle, PackageCheck, PackageOpen, Package } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, moneyShort, number, relative } from '../../shared/format.js';
import { AnimatedNumber, ErrorNotice, Segmented, Skeleton, StatusBadge, useTitle } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, Thumb } from '../components.jsx';
import { AreaChart, BarList, CapacityMeter } from '../charts.jsx';
import { delta, useParam } from '../lib.jsx';

function Stat({ label, value, format, change, note }) {
  const Icon = change?.dir === 'up' ? ArrowUpRight : change?.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="a-panel a-stat">
      <span className="a-stat__label">{label}</span>
      <span className="a-stat__value"><AnimatedNumber value={Number(value) || 0} format={format} /></span>
      {change ? <span className={`a-stat__delta ${change.dir}`}><Icon size={14} aria-hidden="true" />{change.text}</span>
        : <span className="a-stat__delta flat">{note}</span>}
    </div>
  );
}

/** Fill the days the API skipped (no sales) so the line does not jump. */
function fillDays(daily, days) {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const out = [];
  const end = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = byDay.get(key);
    out.push({ x: key, y: row ? Number(row.revenue) : 0, note: row ? `${row.orders} order${row.orders === 1 ? '' : 's'}` : 'no orders' });
  }
  return out;
}

export default function Dashboard() {
  useTitle('Overview', 'MyEnterprise Admin');
  const navigate = useNavigate();
  const [daysParam, setDays] = useParam('days', '30');
  const days = [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const q = useQuery({ queryKey: ['admin-dashboard', days], queryFn: () => api.get('/admin/dashboard', { days }), placeholderData: (prev) => prev });
  const d = q.data;

  const header = (
    <PageHeader title="Overview" sub={`Sales from the last ${days} days, compared with the ${days} days before.`}
      actions={<Segmented label="Period" layoutId="dash-period" value={String(days)} onChange={setDays}
        options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />} />
  );

  if (q.isError && !d) return <>{header}<ErrorNotice error={q.error} onRetry={() => q.refetch()} /></>;
  if (!d) {
    return (
      <>{header}
        <div className="a-stats">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="a-panel a-stat"><Skeleton width="50%" height={12} /><Skeleton width="70%" height={30} /><Skeleton width="60%" height={12} /></div>)}</div>
        <div className="a-grid a-grid--main a-gap"><div className="a-panel" style={{ height: 320 }} /><div className="a-panel" style={{ height: 320 }} /></div>
      </>
    );
  }

  const k = d.kpis;
  const prevAov = k.ordersPrevious ? Number(k.revenuePrevious) / k.ordersPrevious : 0;
  const series = fillDays(d.daily, days);
  const stale = q.isFetching && q.isPlaceholderData;
  const queues = [
    { to: '/returns?status=OPEN', n: d.queues.returns, label: 'Returns to review or refund', icon: Undo2 },
    { to: '/claims?status=OPEN', n: d.queues.claims, label: 'Quality claims open', icon: ShieldCheck },
    { to: '/purchasing?status=ORDERED', n: d.queues.purchaseOrders, label: 'Purchase orders awaiting delivery', icon: Truck },
    { to: '/inventory?low=1', n: d.queues.lowStock, label: 'Stock lines at or under reorder level', icon: AlertTriangle },
  ];

  return (
    <>
      {header}
      <div className="a-stats" style={{ opacity: stale ? 0.6 : 1, transition: 'opacity 200ms' }}>
        <Stat label="Revenue" value={k.revenue} format={(v) => moneyShort(Math.round(v))} change={delta(k.revenue, k.revenuePrevious)} />
        <Stat label="Orders" value={k.orders} format={(v) => number(Math.round(v))} change={delta(k.orders, k.ordersPrevious)} />
        <Stat label="Average order" value={k.averageOrder} format={(v) => money(v)} change={delta(k.averageOrder, prevAov)} />
        <Stat label="Refunded" value={k.refunded} format={(v) => moneyShort(Math.round(v))} note={`Returns and cancellations, last ${days} days`} />
        <Stat label="New customers" value={k.newCustomers} format={(v) => number(Math.round(v))} note={`Accounts opened, last ${days} days`} />
      </div>

      <div className="a-grid a-grid--main a-gap">
        <Panel title="Revenue per day" sub="Order totals placed each day, cancelled orders excluded">
          <AreaChart data={series} height={300} money formatValue={(v) => money(v)} label={`Revenue per day, last ${days} days`} stale={stale} />
          <details className="a-tableview">
            <summary>Show as a table</summary>
            <div className="a-table-wrap" style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
              <table className="a-table a-table--compact">
                <thead><tr><th scope="col">Day</th><th scope="col" className="num">Orders</th><th scope="col" className="num">Revenue</th></tr></thead>
                <tbody>{d.daily.map((r) => <tr key={r.day}><td>{r.day}</td><td className="num">{r.orders}</td><td className="num">{money(r.revenue)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </Panel>
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Order pipeline" sub="Paid orders not yet delivered">
            <div className="a-pipe">
              {[['PLACED', 'Waiting to pack', PackageOpen, d.pipeline.placed], ['PROCESSING', 'Being packed', Package, d.pipeline.processing], ['SHIPPED', 'With the carrier', PackageCheck, d.pipeline.shipped]]
                .map(([s, label, Icon, n]) => (
                  <Link key={s} to={`/orders?status=${s}`} className="a-pipe__step">
                    <span className="a-pipe__n">{n}</span>
                    <span className="a-pipe__label"><Icon size={15} aria-hidden="true" />{label}</span>
                  </Link>
                ))}
            </div>
          </Panel>
          <Panel title="Needs attention">
            <div className="a-queue">
              {queues.map((item) => (
                <Link key={item.to} to={item.to} className="a-queue__item">
                  <span className="a-queue__icon"><item.icon size={18} aria-hidden="true" /></span>
                  <span className="a-queue__label">{item.label}</span>
                  <span className="a-queue__n num">{item.n}</span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="a-grid a-grid--main a-gap">
        <Panel title="Recent orders" flush actions={<Link className="text-link small" to="/orders">All orders</Link>}>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Placed</th><th scope="col" className="num">Total</th></tr></thead>
              <tbody>
                {d.recentOrders.map((o) => (
                  <tr key={o.id} className="is-link" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td><Link className="a-link" to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link></td>
                    <td>{o.customer}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="muted">{relative(o.placedAt)}</td>
                    <td className="num">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Panel title="Top products" sub={`By revenue, last ${days} days`}>
            {d.topProducts.length ? (
              <>
                <BarList label="Top products by revenue" rows={d.topProducts.map((p) => ({ key: p.slug, label: p.name, value: Number(p.revenue), display: moneyShort(p.revenue) }))} />
                <details className="a-tableview">
                  <summary>Show as a table</summary>
                  <table className="a-table a-table--compact" style={{ marginTop: 8 }}>
                    <thead><tr><th scope="col">Product</th><th scope="col" className="num">Units</th><th scope="col" className="num">Revenue</th></tr></thead>
                    <tbody>{d.topProducts.map((p) => (
                      <tr key={p.slug}><td><span className="a-cell-product"><Thumb src={p.image} />{p.name}</span></td><td className="num">{p.units}</td><td className="num">{money(p.revenue)}</td></tr>
                    ))}</tbody>
                  </table>
                </details>
              </>
            ) : <p className="muted">No sales in this period.</p>}
          </Panel>
          <Panel title="Warehouse capacity" sub="Units on hand against each building's capacity">
            <div className="a-meter__legend" style={{ marginBottom: 12 }}>
              <span className="a-key" style={{ '--key': 'var(--a-series)' }}>Free to sell</span>
              <span className="a-key" style={{ '--key': '#b49ad2' }}>Reserved for orders</span>
            </div>
            <div className="stack" style={{ '--gap': '16px' }}>
              {d.warehouses.map((w) => <CapacityMeter key={w.id} name={w.name} capacity={w.capacity} onHand={w.onHand} reserved={w.reserved} />)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
