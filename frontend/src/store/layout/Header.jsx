import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Search, ShoppingBag, User, Menu, X, ArrowRight } from 'lucide-react';
import Logo from './Logo.jsx';
import { useShell } from './Layout.jsx';
import { useSession } from '../hooks.js';
import { ProductImage, EASE } from '../../shared/ui/index.jsx';
import { productPicture } from '../../shared/api.js';

// Mega-menu content. Links use category slugs from the database (Category.slug).
const PANELS = {
  women: {
    label: 'Women',
    picture: { src: productPicture('wrap-midi-dress', 'Blush'), alt: 'Wrap midi dress in blush', to: '/shop/women', text: 'Shop women' },
    columns: [
      ['Clothing', [['Shirts & tops', 'tops'], ['Knitwear', 'knitwear'], ['Dresses & skirts', 'dresses'], ['Trousers & jeans', 'trousers'], ['Outerwear', 'outerwear']]],
      ['Shoes & bags', [['Shoes', 'shoes'], ['Bags', 'bags'], ['Accessories', 'accessories']]],
      ['Collections', [['New in', 'new-in'], ['The linen edit', 'linen-edit'], ['Everyday essentials', 'essentials']]],
    ],
  },
  men: {
    label: 'Men',
    picture: { src: productPicture('wool-overcoat', 'Camel'), alt: 'Wool overcoat in camel', to: '/shop/men', text: 'Shop men' },
    columns: [
      ['Clothing', [['Shirts & tops', 'tops'], ['Knitwear', 'knitwear'], ['Trousers & jeans', 'trousers'], ['Outerwear', 'outerwear']]],
      ['Shoes & bags', [['Shoes', 'shoes'], ['Bags', 'bags'], ['Accessories', 'accessories']]],
      ['Collections', [['New in', 'new-in'], ['Everyday essentials', 'essentials']]],
    ],
  },
};
const NAV = [
  { key: 'women', to: '/shop/women', label: 'Women' },
  { key: 'men', to: '/shop/men', label: 'Men' },
  { to: '/shop/new-in', label: 'New in' },
  { to: '/shop/shoes', label: 'Shoes' },
  { to: '/shop/bags', label: 'Bags' },
];

export default function Header() {
  const { openBag, openSearch } = useShell();
  const { data: session } = useSession();
  const [panel, setPanel] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef(null);
  const location = useLocation();
  const reduce = useReducedMotion();
  const count = session?.cartCount || 0;

  useEffect(() => { setPanel(null); setMenuOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const enter = (key) => { clearTimeout(timer.current); timer.current = setTimeout(() => setPanel(key || null), panel ? 0 : 150); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setPanel(null), 120); };

  return (
    <header className="nav" onMouseLeave={leave}>
      <div className="wrap nav__bar">
        <Logo />
        <nav className="nav__words" aria-label="Shop">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav__word"
              onMouseEnter={() => enter(item.key)} onFocus={() => enter(item.key)}
              aria-expanded={item.key ? panel === item.key : undefined}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav__actions">
          <button type="button" className="icon-btn" onClick={openSearch} aria-label="Search the shop"><Search size={20} /></button>
          <Link to={session?.customer ? '/account' : '/sign-in'} className="icon-btn nav__account" aria-label={session?.customer ? 'Your account' : 'Sign in'}>
            <User size={20} />
            <span className="nav__account-label">{session?.customer ? session.customer.firstName : 'Sign in'}</span>
          </Link>
          <button type="button" className="icon-btn bag-btn" onClick={openBag} aria-label={`Bag, ${count} ${count === 1 ? 'item' : 'items'}`}>
            <ShoppingBag size={20} />
            <AnimatePresence initial={false}>
              {count > 0 && (
                <motion.span key={count} className="bag-btn__count"
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button type="button" className="icon-btn nav__toggle" aria-expanded={menuOpen} aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {panel && PANELS[panel] && (
          <motion.div className="mega" key="mega" onMouseEnter={() => clearTimeout(timer.current)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2, ease: EASE }}>
            <div className="wrap mega__grid">
              {PANELS[panel].columns.map(([title, links]) => (
                <div key={title} className="mega__col">
                  <p className="label">{title}</p>
                  <ul>
                    {links.map(([label, slug]) => (
                      <li key={slug}>
                        <Link className="mega__link" to={`/shop/${panel}${slug !== panel ? `?also=${slug}` : ''}`}>{label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Link to={PANELS[panel].picture.to} className="mega__card m-zoom-parent">
                <span className="frame frame--45 m-zoom"><ProductImage src={PANELS[panel].picture.src} alt={PANELS[panel].picture.alt} eager /></span>
                <span className="mega__card-text">{PANELS[panel].picture.text} <ArrowRight size={16} className="m-arrow" /></span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav id="mobile-menu" className="sheet" aria-label="Menu"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <ul className="sheet__list">
              {[...NAV, { to: '/shop/outerwear', label: 'Outerwear' }, { to: '/shop/knitwear', label: 'Knitwear' }, { to: '/shop/linen-edit', label: 'The linen edit' },
                { to: session?.customer ? '/account' : '/sign-in', label: session?.customer ? 'Your account' : 'Sign in' }].map((item, i) => (
                <motion.li key={item.to + item.label} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * i, duration: 0.24, ease: EASE }}>
                  <Link to={item.to} className="sheet__link">{item.label}<ArrowRight size={18} /></Link>
                </motion.li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
