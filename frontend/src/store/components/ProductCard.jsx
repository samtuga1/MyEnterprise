import { useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Check } from 'lucide-react';
import { api } from '../../shared/api.js';
import { priceRange } from '../../shared/format.js';
import { ProductImage, useToast, EASE } from '../../shared/ui/index.jsx';
import { useCartMutation } from '../hooks.js';
import { useShell } from '../layout/Layout.jsx';

export const productQuery = (slug) => ({ queryKey: ['product', slug], queryFn: () => api.get(`/products/${slug}`), staleTime: 60_000 });

/** Size picker that appears over the photograph: add without leaving the grid. */
function QuickAdd({ product, color, onDone }) {
  const { data, isLoading } = useQuery(productQuery(product.slug));
  const add = useCartMutation('add');
  const toast = useToast();
  const { openBag } = useShell();
  const [added, setAdded] = useState(null);
  const variants = (data?.variants || []).filter((v) => v.color === color);
  const pick = (v) => {
    add.mutate({ variantId: v.id, quantity: 1 }, {
      onSuccess: () => {
        setAdded(v.id);
        toast(`${product.name}, ${v.size} added to your bag.`, { action: { label: 'View bag', onClick: openBag } });
        setTimeout(onDone, 700);
      },
      onError: (e) => toast.error(e.message),
    });
  };
  return (
    <motion.div className="quick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2, ease: EASE }}
      onClick={(e) => e.preventDefault()}>
      <p className="quick__title">Choose a size</p>
      {isLoading ? <span className="spinner" aria-label="Loading sizes" /> : (
        <div className="quick__sizes">
          {variants.map((v) => (
            <button key={v.id} type="button" className="quick__size" disabled={v.available < 1 || add.isPending}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); pick(v); }}
              aria-label={`${v.size}${v.available < 1 ? ', sold out' : ''}`}>
              {added === v.id ? <Check size={14} /> : v.size.replace('EU ', '')}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function ProductCard({ product, eager = false, tone }) {
  const [color, setColor] = useState(product.colors[0]?.name);
  const [quick, setQuick] = useState(false);
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const current = product.colors.find((c) => c.name === color) || product.colors[0];
  const image = current?.image || product.image;
  const soldOut = product.available < 1;
  const prefetch = () => qc.prefetchQuery(productQuery(product.slug));
  const href = `/product/${product.slug}${color && color !== product.colors[0]?.name ? `?color=${encodeURIComponent(color)}` : ''}`;

  return (
    <article className={`pcard ${tone === 'dark' ? 'pcard--dark' : ''}`} onMouseEnter={prefetch} onFocus={prefetch} onMouseLeave={() => setQuick(false)}>
      <Link to={href} className="pcard__media frame frame--45 m-zoom" aria-label={`${product.name}, ${priceRange(product.minPrice, product.maxPrice)}`}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={image} className="pcard__img" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <ProductImage src={image} alt={`${product.name} in ${current?.name || ''}`} eager={eager} />
          </motion.span>
        </AnimatePresence>
        <span className="pcard__flags">
          {product.isNew && <span className="badge badge--plain pcard__flag">New</span>}
          {soldOut && <span className="badge badge--plain pcard__flag">Sold out</span>}
        </span>
        {!soldOut && (
          <span className="pcard__quick-wrap">
            <AnimatePresence>
              {quick ? <QuickAdd product={product} color={color} onDone={() => setQuick(false)} /> : (
                <motion.button type="button" className="pcard__quick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuick(true); }} aria-label={`Quick add ${product.name}`}>
                  <Plus size={16} /> Quick add
                </motion.button>
              )}
            </AnimatePresence>
          </span>
        )}
      </Link>
      <div className="pcard__body">
        <div className="pcard__row">
          <Link to={href} className="pcard__name">{product.name}</Link>
          <span className="pcard__price price">{priceRange(product.minPrice, product.maxPrice)}</span>
        </div>
        <div className="pcard__row">
          <span className="pcard__brand">{product.brand}</span>
          {product.colors.length > 1 && (
            <div className="pcard__swatches" role="radiogroup" aria-label={`${product.name} colours`}>
              {product.colors.map((c) => (
                <button key={c.name} type="button" role="radio" aria-checked={c.name === color} aria-label={c.name}
                  className="swatch swatch--sm" style={{ '--sw': c.hex }} onClick={() => setColor(c.name)} onMouseEnter={() => setColor(c.name)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, eagerCount = 4, tone, columns }) {
  const reduce = useReducedMotion();
  return (
    <motion.ul className="pgrid" style={columns ? { '--cols': columns } : undefined} layout={!reduce}>
      <AnimatePresence initial={false} mode="popLayout">
        {products.map((p, i) => (
          <motion.li key={p.id} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }} transition={{ duration: 0.32, ease: EASE }}>
            <ProductCard product={p} eager={i < eagerCount} tone={tone} />
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
