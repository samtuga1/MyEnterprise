import { useState } from 'react';
import { NavLink, Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, ShoppingBag, Undo2, ShieldCheck, Users, Shirt, Tags, Boxes, Truck, BarChart3, Database,
  Menu, LogOut, ExternalLink,
} from 'lucide-react';
import { api, BASE } from '../../shared/api.js';
import markUrl from '../../shared/brand/mark.png';
import { Drawer, useToast } from '../../shared/ui/index.jsx';
import { ROLE_LABEL } from '../../shared/format.js';
import { SESSION_KEY, initials, useAdmin, useCan } from '../lib.jsx';

const NAV = [
  { title: null, items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }] },
  { title: 'Sales', items: [
    { to: '/orders', label: 'Orders', icon: ShoppingBag, area: 'orders', count: 'orders' },
    { to: '/returns', label: 'Returns', icon: Undo2, area: 'aftersales', count: 'returns' },
    { to: '/claims', label: 'Claims', icon: ShieldCheck, area: 'aftersales', count: 'claims' },
    { to: '/customers', label: 'Customers', icon: Users, area: 'customers' },
  ] },
  { title: 'Catalog', items: [
    { to: '/products', label: 'Products', icon: Shirt, area: 'catalog' },
    { to: '/categories', label: 'Categories', icon: Tags, area: 'catalog' },
  ] },
  { title: 'Stock', items: [
    { to: '/inventory', label: 'Inventory', icon: Boxes, area: 'inventory', count: 'lowStock' },
    { to: '/purchasing', label: 'Purchasing', icon: Truck, area: 'procurement' },
  ] },
  { title: 'Insight', items: [
    { to: '/reports', label: 'Reports', icon: BarChart3, area: 'reports' },
    { to: '/database', label: 'Database', icon: Database, area: 'database' },
  ] },
];

/** The MyEnterprise mark, the same file as the shop header's (tools/brand/make-icons.php). */
export function BrandMark({ className = 'a-brand__mark' }) {
  return <img src={markUrl} className={className} width="28" height="28" alt="" aria-hidden="true" decoding="async" />;
}

function Sidebar({ onNavigate, pillId }) {
  const can = useCan();
  const reduce = useReducedMotion();
  const counts = useQuery({ queryKey: ['admin-dashboard', 30], queryFn: () => api.get('/admin/dashboard', { days: 30 }), staleTime: 60_000 });
  const d = counts.data;
  const countFor = (k) => {
    if (!d) return 0;
    if (k === 'orders') return d.pipeline.placed + d.pipeline.processing;
    return d.queues[k] || 0;
  };
  return (
    <div className="a-side">
      <div className="a-brand"><BrandMark /><span className="a-brand__name">MyEnterprise</span><span className="a-brand__tag">Admin</span></div>
      <nav className="a-nav" aria-label="Admin">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.area || can.see(i.area));
          if (!items.length) return null;
          return (
            <div className="a-nav__group" key={group.title || 'top'}>
              {group.title && <div className="a-nav__title">{group.title}</div>}
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="a-nav__link" onClick={onNavigate}>
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId={pillId} className="a-nav__pill" transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }} />}
                      <item.icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.count && countFor(item.count) > 0 && <span className="a-nav__count" aria-label={`${countFor(item.count)} waiting`}>{countFor(item.count)}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="a-side__foot">MariaDB · PHP · React</div>
    </div>
  );
}

export default function Shell() {
  const admin = useAdmin();
  const location = useLocation();
  const matches = useMatches();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [menu, setMenu] = useState(false);
  const crumb = [...matches].reverse().find((m) => m.handle?.crumb)?.handle.crumb;

  const signOut = async () => {
    try { await api.post('/admin/auth/logout'); } catch { /* already signed out */ }
    qc.clear();
    qc.setQueryData(SESSION_KEY, { admin: null });
    toast('You are signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="a-shell">
      <a className="skip-link" href="#a-main" onClick={(e) => { e.preventDefault(); document.getElementById('a-main')?.focus(); }}>Skip to content</a>
      <aside className="a-side--desktop"><Sidebar pillId="nav-pill" /></aside>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Menu" side="left">
        <div className="a-drawer-nav"><Sidebar pillId="nav-pill-drawer" onNavigate={() => setMenu(false)} /></div>
      </Drawer>
      <div className="a-main">
        <header className="a-top">
          <button type="button" className="btn btn--secondary btn--icon a-top__menu" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}>
            <Menu size={20} />
          </button>
          <div className="a-top__crumbs">
            <span>MyEnterprise Admin</span>
            {crumb && <><span aria-hidden="true">/</span><strong>{crumb}</strong></>}
          </div>
          <div className="a-top__right">
            <a className="btn btn--quiet btn--sm" href={`${BASE}/`} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> <span className="a-top__label">View store</span>
            </a>
            <div className="a-user">
              <span className="a-user__avatar" aria-hidden="true">{initials(admin.name)}</span>
              <span className="a-user__meta">
                <span className="a-user__name">{admin.name}</span><br />
                <span className="a-user__role">{ROLE_LABEL[admin.role] || admin.role}</span>
              </span>
            </div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={signOut}><LogOut size={15} /> <span className="a-top__label">Sign out</span></button>
          </div>
        </header>
        <motion.main id="a-main" tabIndex={-1} className="a-content" key={location.pathname}
          initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}
