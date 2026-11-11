import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ShieldCheck, Truck, RotateCcw, Ruler, ShoppingBag, ChevronRight } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money, priceRange } from '../../shared/format.js';
import { EmptyState, ProductImage, Skeleton, useTitle, useToast, EASE } from '../../shared/ui/index.jsx';
import { productQuery, ProductGrid } from '../components/ProductCard.jsx';
import { useCartMutation } from '../hooks.js';
import { useShell } from '../layout/Layout.jsx';

const VIEWS = [
  { key: 'front', label: 'Front', style: {} },
  { key: 'detail', label: 'Detail', style: { transform: 'scale(1.9)', transformOrigin: '50% 22%' } },
  { key: 'close', label: 'Close-up', style: { transform: 'scale(2.6)', transformOrigin: '38% 58%' } },
];
const TYPE_LABEL = { PAIRS_WITH: 'Pairs with', LAYERS_WITH: 'Layer with', COMPLETES_LOOK: 'Finish with' };

function stockNote(v) {
  if (!v) return null;
  if (v.available < 1) return { tone: 'danger', text: 'Sold out in this size' };
  if (v.available <= 3) return { tone: 'warn', text: `Only ${v.available} left in this size` };
  return { tone: 'ok', text: 'In stock, ships in 1–2 working days' };
}

function Gallery({ product, color }) {
  const reduce = useReducedMotion();
  const pictures = product.colors.find((c) => c.name === color)?.images || [];
  // Several pictures of this colour: one thumbnail each. One picture: front, detail and close-up crops of it.
  const views = pictures.length > 1
    ? pictures.map((p, i) => ({ key: p.src, label: `View ${i + 1}`, src: p.src, alt: p.alt, style: {} }))
    : VIEWS.map((v) => ({ ...v, src: pictures[0]?.src || product.image,
      alt: `${pictures[0]?.alt || `${product.name} in ${color}`}, ${v.label.toLowerCase()} view` }));
  const [view, setView] = useState(0);
  useEffect(() => { setView(0); }, [color]);
  const current = views[Math.min(view, views.length - 1)];
  return (
    <div className="gallery">
      <div className="gallery__thumbs" role="tablist" aria-label="Views">
        {views.map((v, i) => (
          <button key={v.key} type="button" role="tab" aria-selected={current === v} aria-label={v.label}
            className={`gallery__thumb frame frame--45 ${current === v ? 'is-on' : ''}`} onClick={() => setView(i)}>
            <ProductImage src={v.src} alt="" style={v.style} />
          </button>
        ))}
      </div>
      <div className="gallery__main frame frame--45">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div key={`${current.src}-${current.key}`} className="gallery__img" initial={reduce ? false : { opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
            <ProductImage src={current.src} alt={current.alt} eager
              style={{ ...current.style, transition: 'transform 600ms cubic-bezier(.2,.8,.2,1)' }} />
          </motion.div>
        </AnimatePresence>
        {product.isNew && <span className="badge badge--plain pcard__flag gallery__flag">New</span>}
      </div>
    </div>
  );
}

function SizeTable({ product }) {
  const rows = useMemo(() => {
    const byColor = product.variants.filter((v) => v.color === product.colors[0]?.name);
    return byColor.map((v) => {
      const m = v.specs.find((s) => !['Material', 'Care', 'Fit'].includes(s.name));
      return { size: v.size, name: m?.name, value: m ? `${m.value}${m.unit ? ` ${m.unit}` : ''}` : '—' };
    });
  }, [product]);
  if (!rows.length || !rows[0].name || rows.length < 2) return null;
  return (
    <table className="size-table">
      <caption className="sr-only">Measurements by size</caption>
      <thead><tr><th scope="col">Size</th>{rows.map((r) => <th key={r.size} scope="col">{r.size}</th>)}</tr></thead>
      <tbody><tr><th scope="row">{rows[0].name}</th>{rows.map((r) => <td key={r.size} className="num">{r.value}</td>)}</tr></tbody>
    </table>
  );
}

export default function Product() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: product, isLoading, error } = useQuery(productQuery(slug));
  const add = useCartMutation('add');
  const toast = useToast();
  const { openBag } = useShell();
  const reduce = useReducedMotion();
  const [size, setSize] = useState(null);
  const [sizeError, setSizeError] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const color = params.get('color') && product?.colors.some((c) => c.name === params.get('color')) ? params.get('color') : product?.colors[0]?.name;
  const variants = product?.variants.filter((v) => v.color === color) || [];
  const variant = variants.find((v) => v.size === size);
  useTitle(product ? `${product.name}${color ? ` in ${color}` : ''}` : null);
  useEffect(() => { setSize(null); setSizeError(false); }, [slug]);
  useEffect(() => { if (variants.length === 1) setSize(variants[0].size); }, [color, product]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeSlug = product?.categories.find((c) => c.group === 'TYPE')?.slug;
  const { data: related } = useQuery({
    queryKey: ['related', typeSlug], enabled: !!typeSlug,
    queryFn: () => api.get('/products', { category: typeSlug, perPage: 5, sort: 'featured' }),
  });

  if (isLoading) {
    return (
      <div className="wrap product" aria-busy="true">
        <Skeleton height="auto" style={{ aspectRatio: '4 / 5' }} radius={12} />
        <div className="stack"><Skeleton width="30%" /><Skeleton width="80%" height={48} /><Skeleton width="20%" height={24} /><Skeleton height={140} /></div>
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="wrap" style={{ padding: 'calc(var(--nav) + 64px) var(--gut) 96px' }}>
        <EmptyState icon={<ShoppingBag />} title="This piece is no longer available" action={<Link to="/shop" className="btn btn--primary">Shop new arrivals</Link>}>
          It may have sold out for the season. Similar pieces are in the shop.
        </EmptyState>
      </div>
    );
  }

  const note = stockNote(variant);
  const price = variant ? money(variant.price) : priceRange(Math.min(...variants.map((v) => +v.price)), Math.max(...variants.map((v) => +v.price)));
  const selectColor = (c) => { const next = new URLSearchParams(params); next.set('color', c); setParams(next, { replace: true, preventScrollReset: true }); setSize(null); };

  const addToBag = () => {
    if (!variant) { setSizeError(true); document.getElementById('size-group')?.focus(); return; }
    add.mutate({ variantId: variant.id, quantity: 1 }, {
      onSuccess: () => {
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1800);
        toast(`${product.name}, ${variant.size}, ${color} added to your bag.`, { action: { label: 'View bag', onClick: openBag } });
        setTimeout(openBag, 450);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const crumbs = product.categories.filter((c) => c.group !== 'COLLECTION').slice(0, 2);
  const relatedItems = (related?.items || []).filter((p) => p.slug !== product.slug).slice(0, 4);

  return (
    <>
      <div className="wrap product">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/shop" className="link">Shop</Link>
          {crumbs.map((c) => <span key={c.slug}><ChevronRight size={14} aria-hidden="true" /> <Link to={`/shop/${c.slug}`} className="link">{c.name}</Link></span>)}
        </nav>
        <Gallery product={product} color={color} />

        <div className="product__info">
          <p className="label">{product.brand}</p>
          <h1 className="product__name">{product.name}</h1>
          <p className="product__price price">{price}</p>
          <p className="product__desc">{product.description}</p>

          <div className="product__block">
            <p className="product__opt">Colour <strong>{color}</strong></p>
            <div className="swatches" role="radiogroup" aria-label="Colour">
              {product.colors.map((c) => (
                <button key={c.name} type="button" role="radio" aria-checked={c.name === color} aria-label={`${c.name}${c.available < 1 ? ', sold out' : ''}`}
                  className="swatch" style={{ '--sw': c.hex }} onClick={() => selectColor(c.name)} />
              ))}
            </div>
          </div>

          <div className="product__block">
            <div className="row row--between">
              <p className="product__opt" id="size-label">Size {size && <strong>{size}</strong>}</p>
              {product.fit && <span className="small muted"><Ruler size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {product.fit} fit</span>}
            </div>
            <div id="size-group" className="sizes" role="radiogroup" aria-labelledby="size-label" tabIndex={-1} aria-describedby={sizeError ? 'size-error' : undefined}>
              {variants.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={v.size === size} className="size" data-sold-out={v.available < 1}
                  disabled={v.available < 1} onClick={() => { setSize(v.size); setSizeError(false); }}
                  aria-label={`${v.size}${v.available < 1 ? ', sold out' : v.available <= 3 ? `, only ${v.available} left` : ''}`}>
                  {v.size}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              {sizeError ? (
                <motion.p key="err" id="size-error" className="field__error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>Choose a size to add it to your bag.</motion.p>
              ) : note ? (
                <motion.p key={note.text} className={`stock-note stock-note--${note.tone}`} initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{note.text}</motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <button type="button" className="btn btn--primary btn--lg btn--block add-btn" onClick={addToBag} disabled={add.isPending || (variant && variant.available < 1)}>
            <AnimatePresence mode="wait" initial={false}>
              {add.isPending ? (
                <motion.span key="busy" className="row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span className="spinner" /> Adding</motion.span>
              ) : justAdded ? (
                <motion.span key="done" className="row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={18} /> Added to your bag</motion.span>
              ) : (
                <motion.span key="idle" className="row" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><ShoppingBag size={18} /> Add to bag</motion.span>
              )}
            </AnimatePresence>
          </button>

          <ul className="product__promises">
            <li><Truck size={18} /> Free standard delivery from $150. Express $18, one to two days.</li>
            <li><RotateCcw size={18} /> Return within 30 days of delivery from your order page.</li>
            {product.warranty && <li><ShieldCheck size={18} /> {product.warranty.months}-month quality guarantee on seams, zips and hardware.</li>}
          </ul>

          <div className="product__details">
            <section>
              <h2 className="product__h">Material and care</h2>
              <dl className="dl">
                {product.material && <><dt>Material</dt><dd>{product.material}</dd></>}
                {product.care && <><dt>Care</dt><dd>{product.care}</dd></>}
                {product.fit && <><dt>Fit</dt><dd>{product.fit}</dd></>}
                {variant && <><dt>SKU</dt><dd className="num">{variant.sku}</dd></>}
              </dl>
            </section>
            <section>
              <h2 className="product__h">Sizes and measurements</h2>
              <SizeTable product={product} />
            </section>
            {product.warranty && (
              <section>
                <h2 className="product__h">Quality guarantee</h2>
                <p className="small">{product.warranty.months} months from delivery. {product.warranty.coverage}</p>
              </section>
            )}
          </div>
        </div>
      </div>

      {product.styleWith.length > 0 && (
        <section className="section section--alt" aria-labelledby="style-h">
          <div className="wrap">
            <div className="section__head"><h2 id="style-h">Style it with</h2></div>
            <ul className="style-with">
              {product.styleWith.slice(0, 4).map((s) => (
                <li key={`${s.slug}-${s.color}`}>
                  <Link to={`/product/${s.slug}?color=${encodeURIComponent(s.color)}`} className="style-card m-zoom-parent">
                    <span className="frame frame--sq m-zoom"><ProductImage src={s.image} alt={`${s.name} in ${s.color}`} /></span>
                    <span className="style-card__body">
                      <span className="label">{TYPE_LABEL[s.type] || 'Pairs with'}</span>
                      <span className="style-card__name">{s.name}</span>
                      <span className="small muted">{s.color} · {money(s.price)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {relatedItems.length > 0 && (
        <section className="section" aria-labelledby="related-h">
          <div className="wrap">
            <div className="section__head"><h2 id="related-h">More {product.categories.find((c) => c.group === 'TYPE')?.name.toLowerCase()}</h2></div>
            <ProductGrid products={relatedItems} eagerCount={0} />
          </div>
        </section>
      )}

      <div className="sticky-add" aria-hidden={false}>
        <div>
          <p className="sticky-add__name">{product.name}</p>
          <p className="small muted">{color}{size ? ` · ${size}` : ''} · {price}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={addToBag} disabled={add.isPending}>{justAdded ? 'Added' : 'Add to bag'}</button>
      </div>
    </>
  );
}
