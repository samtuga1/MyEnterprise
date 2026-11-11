import { Link, useLocation } from 'react-router';
import { ArrowRight, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { Mark } from './Logo.jsx';

/* The dealt "type" close: the page's last word set large, with the three service facts as real icons. */
function Close() {
  return (
    <div className="close">
      <h2 className="close__title">Thirty days to change your mind</h2>
      <ul className="close__facts">
        <li><Truck size={22} aria-hidden="true" /><span><strong>Free standard delivery</strong> from $150, express $18</span></li>
        <li><RotateCcw size={22} aria-hidden="true" /><span><strong>Returns</strong> within 30 days of delivery</span></li>
        <li><ShieldCheck size={22} aria-hidden="true" /><span><strong>Quality guarantee</strong> of 6 to 12 months</span></li>
      </ul>
      <Link to="/shop/new-in" className="btn btn--primary close__btn">Shop new arrivals <ArrowRight size={18} className="m-arrow" /></Link>
    </div>
  );
}

const COLUMNS = [
  ['Shop', [['Women', '/shop/women'], ['Men', '/shop/men'], ['New in', '/shop/new-in'], ['Shoes', '/shop/shoes'], ['Bags', '/shop/bags']]],
  ['Collections', [['The linen edit', '/shop/linen-edit'], ['Everyday essentials', '/shop/essentials'], ['Outerwear', '/shop/outerwear'], ['Knitwear', '/shop/knitwear']]],
  ['Your orders', [['Sign in', '/sign-in'], ['Order history', '/account'], ['Your bag', '/bag'], ['Create an account', '/register']]],
];

export default function Footer() {
  const { pathname } = useLocation();
  const home = pathname === '/' || pathname === '';
  return (
    <footer className={`footer ${home ? 'closing' : ''}`}>
      <div className="wrap">
        {home && <Close />}
        <div className="footer__dir">
        <div className="footer__top">
          <div className="footer__brand">
            <span className="footer__name"><Mark size={34} /> MyEnterprise</span>
            <p className="footer__line">Clothing, shoes and bags from seven small labels, packed in Chicago, Austin and Newark.</p>
            {!home && <dl className="footer__facts">
              <div><dt>Delivery</dt><dd>Free standard delivery from $150. Express $18.</dd></div>
              <div><dt>Returns</dt><dd>30 days from delivery, from your order page.</dd></div>
              <div><dt>Quality guarantee</dt><dd>6 months on clothing, 12 on shoes, coats and bags.</dd></div>
            </dl>}
          </div>
          {COLUMNS.map(([title, links]) => (
            <div key={title} className="footer__col">
              <h3>{title}</h3>
              <ul>
                {links.map(([label, to]) => <li key={to}><Link to={to} className="footer__link">{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer__legal">
          <span>© {new Date().getFullYear()} MyEnterprise</span>
          <span>Prices in US dollars, including all taxes.</span>
        </div>
        </div>
      </div>
    </footer>
  );
}
