import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Package, ChevronRight, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, date, number } from '../../shared/format.js';
import { EmptyState, ErrorNotice, ProductImage, Skeleton, StatusBadge, useTitle, useToast, EASE } from '../../shared/ui/index.jsx';
import { useAuthMutation, useSession } from '../hooks.js';

export function AccountNav({ current }) {
  const logout = useAuthMutation('/auth/logout');
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <nav className="account-nav" aria-label="Account">
      <Link to="/account" className={`account-nav__link ${current === 'orders' ? 'is-on' : ''}`} aria-current={current === 'orders' ? 'page' : undefined}><Package size={17} /> Orders</Link>
      <Link to="/account/settings" className={`account-nav__link ${current === 'settings' ? 'is-on' : ''}`} aria-current={current === 'settings' ? 'page' : undefined}><SettingsIcon size={17} /> Details and password</Link>
      <button type="button" className="account-nav__link" onClick={() => logout.mutate({}, { onSuccess: () => { toast('You are signed out.'); navigate('/'); } })}>
        <LogOut size={17} /> Sign out
      </button>
    </nav>
  );
}

export default function Account() {
  useTitle('Your orders');
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const profile = useQuery({ queryKey: ['account', 'profile'], queryFn: () => api.get('/account') });
  const orders = useQuery({ queryKey: ['account', 'orders'], queryFn: () => api.get('/account/orders') });
  const name = session?.customer?.firstName;

  return (
    <div className="wrap page-pad account">
      <header className="account__head">
        <h1 className="page-title">Hello{name ? `, ${name}` : ''}.</h1>
        {profile.data && (
          <p className="muted">Member since {date(profile.data.memberSince)} · {number(profile.data.orders)} orders · {money(profile.data.spent)} spent</p>
        )}
      </header>
      <div className="account__layout">
        <AccountNav current="orders" />
        <section aria-labelledby="orders-h">
          <h2 id="orders-h" className="sr-only">Orders</h2>
          <ErrorNotice error={orders.error} onRetry={orders.refetch} />
          {orders.isLoading ? (
            <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} height={104} radius={20} />)}</div>
          ) : !orders.data?.length ? (
            <EmptyState icon={<Package />} title="No orders yet" action={<Link to="/shop/new-in" className="btn btn--primary">Shop new arrivals</Link>}>
              When you place an order it appears here with its tracking, returns and receipts.
            </EmptyState>
          ) : (
            <ul className="order-list">
              {orders.data.map((o, i) => (
                <motion.li key={o.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: EASE }}>
                  <Link to={`/account/orders/${o.number}`} className="order-row card">
                    <span className="order-row__thumbs">
                      {o.images.slice(0, 3).map((img, k) => <span key={k} className="order-row__thumb frame frame--45"><ProductImage src={img} alt="" /></span>)}
                    </span>
                    <span className="order-row__main">
                      <span className="order-row__number num">{o.number}</span>
                      <span className="small muted">{date(o.placedAt)} · {o.units} {o.units === 1 ? 'item' : 'items'}</span>
                    </span>
                    <StatusBadge status={o.status} />
                    <span className="price order-row__total">{money(o.total)}</span>
                    <ChevronRight size={18} className="muted" aria-hidden="true" />
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
