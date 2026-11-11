import { Link, useNavigate } from 'react-router';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { money } from '../../shared/format.js';
import { EmptyState, Skeleton, useTitle } from '../../shared/ui/index.jsx';
import { useCart } from '../hooks.js';
import { BagLines, FreeDelivery } from '../layout/BagDrawer.jsx';

export default function Bag() {
  useTitle('Your bag');
  const { data: cart, isLoading } = useCart();
  const navigate = useNavigate();
  return (
    <div className="wrap page-pad">
      <h1 className="page-title">Your bag</h1>
      {isLoading ? <Skeleton height={240} /> : !cart?.lines.length ? (
        <EmptyState icon={<ShoppingBag />} title="Your bag is empty" action={<Link to="/shop/new-in" className="btn btn--primary">Shop new arrivals</Link>}>
          Sizes you add stay here while you browse.
        </EmptyState>
      ) : (
        <div className="checkout">
          <div><BagLines lines={cart.lines} /></div>
          <aside className="summary">
            <h2 className="summary__title">Summary</h2>
            <FreeDelivery subtotal={cart.subtotal} />
            <dl className="summary__rows">
              <div><dt>Subtotal</dt><dd className="price">{money(cart.subtotal)}</dd></div>
              <div><dt>Standard delivery</dt><dd>{Number(cart.delivery.standard) === 0 ? 'Free' : money(cart.delivery.standard)}</dd></div>
            </dl>
            <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!cart.canCheckout} onClick={() => navigate('/checkout')}>
              Go to checkout <ArrowRight size={18} className="m-arrow" />
            </button>
            {!cart.canCheckout && <p className="small" style={{ color: 'var(--danger)' }}>Change the items marked above to continue.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
