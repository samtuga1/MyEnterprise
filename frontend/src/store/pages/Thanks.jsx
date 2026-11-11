import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { api } from '../../shared/api.js';
import { money, date } from '../../shared/format.js';
import { ProductImage, Skeleton, useTitle, EASE_ENTER } from '../../shared/ui/index.jsx';

function DrawnCheck() {
  const reduce = useReducedMotion();
  return (
    <svg className="thanks__check" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <motion.circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" strokeWidth="2.5"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: EASE_ENTER }} />
      <motion.path d="M23 37.5 32 46 50 27" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.55, ease: EASE_ENTER }} />
    </svg>
  );
}

export default function Thanks() {
  const { number } = useParams();
  useTitle('Thank you for your order');
  const { data: order, isLoading } = useQuery({ queryKey: ['account', 'order', number], queryFn: () => api.get(`/account/orders/${number}`) });
  return (
    <div className="wrap page-pad thanks">
      <DrawnCheck />
      <h1 className="page-title">Thank you, your order is in.</h1>
      <p className="lead">Order <strong className="num">{number}</strong> is reserved in our warehouse and will be packed within two working days. You can follow it from your account.</p>
      {isLoading ? <Skeleton height={160} /> : order && (
        <div className="thanks__card">
          <ul className="summary__lines">
            {order.items.map((i) => (
              <li key={i.id}>
                <span className="summary__thumb frame frame--45"><ProductImage src={i.image} alt="" /><span className="summary__qty">{i.quantity}</span></span>
                <span className="grow"><span className="summary__name">{i.name}</span><span className="small muted">{i.color} · {i.size}</span></span>
                <span className="price">{money(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary__rows">
            <div><dt>Placed</dt><dd>{date(order.placedAt)}</dd></div>
            <div><dt>Delivering to</dt><dd>{order.shipping.recipient}, {order.shipping.city}</dd></div>
            <div className="summary__total"><dt>Total paid</dt><dd className="price">{money(order.money.total)}</dd></div>
          </dl>
        </div>
      )}
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <Link to={`/account/orders/${number}`} className="btn btn--primary">Track this order</Link>
        <Link to="/shop/new-in" className="btn btn--secondary">Keep shopping</Link>
      </div>
    </div>
  );
}
