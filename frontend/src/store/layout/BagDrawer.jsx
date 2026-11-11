import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ShoppingBag, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Drawer, ProductImage, Skeleton, useToast, EmptyState, EASE } from '../../shared/ui/index.jsx';
import { money } from '../../shared/format.js';
import { useCart, useCartMutation } from '../hooks.js';

/** Progress towards free standard delivery ($150). */
export function FreeDelivery({ subtotal, threshold = 150 }) {
  const reduce = useReducedMotion();
  const value = Number(subtotal || 0);
  const left = Math.max(0, threshold - value);
  const pct = Math.min(100, (value / threshold) * 100);
  return (
    <div className="free-delivery">
      <p className="small">
        {left > 0 ? <>Add <strong>{money(left)}</strong> more for free standard delivery.</> : <>Your order ships free with standard delivery.</>}
      </p>
      <div className="free-delivery__track" role="progressbar" aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={Math.min(value, threshold)} aria-label="Progress to free delivery">
        <motion.span className="free-delivery__bar" initial={false} animate={{ width: `${pct}%` }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE }} />
      </div>
    </div>
  );
}

export function BagLines({ lines, compact = false }) {
  const setQty = useCartMutation('set');
  const remove = useCartMutation('remove');
  const toast = useToast();
  const reduce = useReducedMotion();
  const change = (line, quantity) =>
    setQty.mutate({ variantId: line.variantId, quantity }, { onError: (e) => toast.error(e.message) });
  return (
    <ul className={`bag-lines ${compact ? 'bag-lines--compact' : ''}`}>
      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <motion.li key={line.variantId} className="bag-line" layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }} transition={{ duration: 0.28, ease: EASE }}>
            <Link to={`/product/${line.slug}?color=${encodeURIComponent(line.color)}`} className="bag-line__img frame frame--45 m-zoom">
              <ProductImage src={line.image} alt={`${line.name} in ${line.color}`} />
            </Link>
            <div className="bag-line__body">
              <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <Link to={`/product/${line.slug}`} className="bag-line__name link">{line.name}</Link>
                  <p className="small muted">{line.color} · {line.size}</p>
                </div>
                <span className="price">{money(line.lineTotal)}</span>
              </div>
              {line.problem && <p className="small" style={{ color: 'var(--danger)', fontWeight: 500 }}>{line.problem}</p>}
              <div className="row row--between">
                <div className="qty" aria-label={`Quantity of ${line.name}`}>
                  <button type="button" aria-label="One fewer" onClick={() => change(line, line.quantity - 1)} disabled={line.quantity <= 1}><Minus size={14} /></button>
                  <output aria-live="polite">{line.quantity}</output>
                  <button type="button" aria-label="One more" onClick={() => change(line, line.quantity + 1)} disabled={line.quantity >= Math.min(10, line.available)}><Plus size={14} /></button>
                </div>
                <button type="button" className="btn btn--quiet btn--sm" onClick={() => remove.mutate({ variantId: line.variantId })} aria-label={`Remove ${line.name}`}>
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export default function BagDrawer({ open, onClose }) {
  const { data: cart, isLoading } = useCart();
  const navigate = useNavigate();
  const lines = cart?.lines || [];
  return (
    <Drawer open={open} onClose={onClose} title={`Your bag${cart?.count ? ` (${cart.count})` : ''}`}
      footer={lines.length > 0 && (
        <div className="stack" style={{ '--gap': '14px' }}>
          <FreeDelivery subtotal={cart.subtotal} />
          <div className="row row--between"><span>Subtotal</span><strong className="price">{money(cart.subtotal)}</strong></div>
          <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!cart.canCheckout}
            onClick={() => { onClose(); navigate('/checkout'); }}>
            Go to checkout <ArrowRight size={18} className="m-arrow" />
          </button>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => { onClose(); navigate('/bag'); }}>View bag</button>
        </div>
      )}>
      {isLoading ? (
        <div className="stack"><Skeleton height={120} /><Skeleton height={120} /></div>
      ) : lines.length === 0 ? (
        <EmptyState icon={<ShoppingBag />} title="Your bag is empty"
          action={<button type="button" className="btn btn--primary" onClick={() => { onClose(); navigate('/shop/new-in'); }}>Shop new arrivals</button>}>
          Sizes you add stay here while you browse.
        </EmptyState>
      ) : (
        <BagLines lines={lines} compact />
      )}
    </Drawer>
  );
}
