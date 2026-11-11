import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Package, RotateCcw, Warehouse } from 'lucide-react';
import { api, BASE, productPicture } from '../../shared/api.js';
import { money, priceRange } from '../../shared/format.js';
import { ProductImage, Skeleton, useTitle, EASE } from '../../shared/ui/index.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { EnterTitle, EnterFade, EnterMedia } from '../components/Enter.jsx';

/* Home page plan (taste-skill deal: product page, palette "flour", Instrument Serif/Sans,
   hero "product", nav-mega, dark band, footer-dark with the type close, moment "pinned-chapters"):
   1 hero      the outfit laid flat across the wrap, the h1 naming what is sold
   2 new in    four new pieces (the one product grid)
   3 category  a type-led list; the picture beside it changes with the row in focus
   4 journey   the dealt moment: how an order reaches you, three steps, one frame
   5 coats     dark band: one coat large, three more as rows
   then footer.closing: the type close and the directory */

function Hero() {
  return (
    <section className="hero hero--product" data-enter aria-labelledby="hero-h">
      <div className="wrap">
        <div className="hero-text hero__in">
          <div className="hero__head">
            <EnterTitle id="hero-h" className="hero__title" lines={['Clothes and shoes', 'for women and men']} />
            <div className="hero__side">
              <EnterFade as="p" index={0} className="lead hero__lead">
                Linen, denim, knitwear, coats, leather shoes and bags from seven small labels. Packed in Chicago,
                Austin or Newark, with free standard delivery from $150.
              </EnterFade>
              <EnterFade index={1} className="btn-row">
                <Link to="/shop/new-in" className="btn btn--primary">Shop new arrivals <ArrowRight size={18} className="m-arrow" /></Link>
                <Link to="/shop/outerwear" className="btn btn--secondary">Shop coats and jackets</Link>
              </EnterFade>
            </div>
          </div>
          <EnterMedia className="hero__stage">
            <ProductImage src="media/hero/outfit.jpg" eager
              alt="An outfit laid flat: a striped top, a pale blue scarf, a leather belt and bag, sunglasses and tan lace-up boots" />
          </EnterMedia>
        </div>
      </div>
    </section>
  );
}

function NewIn({ items, loading }) {
  return (
    <section className="section section--screen" aria-labelledby="new-h">
      <div className="wrap">
        <div className="section__head">
          <h2 id="new-h">New coats and knitwear. <span className="muted">Four pieces from the autumn delivery, in stock now.</span></h2>
          <Link to="/shop/new-in" className="btn btn--secondary">See all new pieces <ArrowRight size={16} className="m-arrow" /></Link>
        </div>
        {loading ? (
          <div className="pgrid">{[0, 1, 2, 3].map((i) => <div key={i}><Skeleton height="auto" style={{ aspectRatio: '4 / 5' }} radius={12} /><Skeleton width="70%" style={{ marginTop: 14 }} /></div>)}</div>
        ) : <ProductGrid products={items || []} eagerCount={0} />}
      </div>
    </section>
  );
}

/* A type-led list: one row a category, the picture at the right follows the row in focus. */
const ROWS = [
  { slug: 'women', label: 'Women', img: productPicture('gathered-midi-dress', 'Terracotta'), alt: 'Gathered midi dress in terracotta' },
  { slug: 'men', label: 'Men', img: productPicture('oxford-cotton-shirt', 'Light blue'), alt: 'Oxford cotton shirt in light blue' },
  { slug: 'outerwear', label: 'Outerwear', img: productPicture('everyday-trench-coat', 'Navy'), alt: 'Everyday trench coat in navy' },
  { slug: 'knitwear', label: 'Knitwear', img: productPicture('chunky-rib-turtleneck', 'Cream'), alt: 'Chunky rib turtleneck in cream' },
  { slug: 'shoes', label: 'Shoes', img: productPicture('everyday-court-sneakers', 'Chalk'), alt: 'Everyday court sneakers in chalk' },
  { slug: 'bags', label: 'Bags', img: productPicture('weekender-duffle-bag', 'Olive'), alt: 'Weekender duffle bag in olive' },
];

function Categories() {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(0);
  return (
    <section className="section section--screen section--alt" aria-labelledby="cat-h">
      <div className="wrap peek">
        <div className="peek__list">
          <h2 id="cat-h">Shop by category</h2>
          <ul>
            {ROWS.map((r, i) => (
              <li key={r.slug}>
                <Link to={`/shop/${r.slug}`} className={`peek__row ${i === on ? 'is-on' : ''}`} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)}>
                  <span className="peek__name">{r.label}</span>
                  <ArrowRight size={20} className="m-arrow" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="peek__frame frame">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div key={ROWS[on].img} className="peek__img" initial={reduce ? false : { opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
              <ProductImage src={ROWS[on].img} alt={ROWS[on].alt} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------- the dealt moment: pinned chapters
   The markup follows the kit's moment (assets/moments/pinned-chapters/moment.js, loaded
   unchanged from public/app/assets/moments). The subtree is static: the kit moves the
   figures into the shared frame while it runs, so React must not re-render it. */
const MOMENTS_URL = import.meta.env.DEV ? '/assets/moments/moments.js' : `${BASE}/app/assets/moments/moments.js`;

const Journey = memo(function Journey() {
  const ref = useRef(null);
  useEffect(() => {
    let mod = null;
    let cancelled = false;
    window.__momentsManual = true;
    import(/* @vite-ignore */ MOMENTS_URL)
      .then((m) => { if (!cancelled) { mod = m; m.mountAll(document); } })
      .catch(() => ref.current?.classList.add('mo-safe'));
    return () => { cancelled = true; mod?.unmountAll(document); };
  }, []);
  return (
    <section ref={ref} className="section journey" data-moment="pinned-chapters" aria-labelledby="journey-h">
      <div className="wrap mo-pc__grid">
        <div className="mo-pc__text">
          <h2 id="journey-h">How an order reaches you</h2>
          <ol className="mo-pc__steps">
            <li className="mo-pc__step">
              <h3>Stock in 3 warehouses, held at checkout</h3>
              <p>Every size shows live stock across three warehouses. When you place the order, your units are reserved, so nobody else buys the last one.</p>
              <figure className="mo-pc__visual mo-pc__visual--lit">
                <div className="ui-card">
                  <div className="ui-card__media frame frame--sq"><ProductImage src={productPicture('relaxed-linen-shirt', 'Olive')} alt="Relaxed linen shirt in olive" /></div>
                  <div className="ui-card__body">
                    <p className="ui-card__title">Relaxed Linen Shirt</p>
                    <p className="small muted">{money(62)} · Olive</p>
                    <div className="ui-sizes">{['XS', 'S', 'M', 'L', 'XL'].map((s) => <span key={s} className={`ui-size ${s === 'M' ? 'is-on' : ''}`}>{s}</span>)}</div>
                    <span className="ui-note">Only 2 left in M</span>
                    <span className="ui-btn">Add to bag</span>
                  </div>
                </div>
              </figure>
            </li>
            <li className="mo-pc__step">
              <h3>Parcels from Chicago, Austin or Newark</h3>
              <p>Orders are packed within two working days. Sizes held in two warehouses travel as two parcels, each with its own tracking number.</p>
              <figure className="mo-pc__visual mo-pc__visual--lit">
                <div className="ui-card ui-card--wide">
                  <p className="ui-card__title"><Package size={18} aria-hidden="true" /> Order ME-10351 · 2 parcels</p>
                  {[['Chicago Central', 'UPS-000000318', 'Delivered', 'ok'], ['Newark East', 'UPS-000000319', 'In transit', 'info']].map(([wh, track, when, tone]) => (
                    <div key={track} className="ui-parcel">
                      <span className="ui-parcel__icon"><Warehouse size={18} aria-hidden="true" /></span>
                      <span className="grow"><strong>{wh}</strong><br /><span className="small muted num">{track}</span></span>
                      <span className={`badge badge--${tone}`}>{when}</span>
                    </div>
                  ))}
                </div>
              </figure>
            </li>
            <li className="mo-pc__step">
              <h3>Returns within 30 days</h3>
              <p>Start a return from your order page. When the parcel is back with us, the price you paid goes back to your card.</p>
              <figure className="mo-pc__visual mo-pc__visual--lit">
                <div className="ui-card ui-card--wide">
                  <p className="ui-card__title"><RotateCcw size={18} aria-hidden="true" /> Return RMA-41</p>
                  <div className="ui-parcel">
                    <span className="ui-thumb frame frame--sq"><ProductImage src={productPicture('gathered-midi-dress', 'Terracotta')} alt="Gathered midi dress in terracotta" /></span>
                    <span className="grow"><strong>Gathered Midi Dress</strong><br /><span className="small muted">S · Terracotta · Too large</span></span>
                    <span className="badge badge--ok">Refunded</span>
                  </div>
                  <div className="ui-steps">{['Requested', 'Approved', 'Received', 'Refunded'].map((s) => <span key={s} className="ui-step"><Check size={14} aria-hidden="true" /> {s}</span>)}</div>
                </div>
              </figure>
            </li>
          </ol>
        </div>
        <div className="mo-pc__visuals frame" />
      </div>
    </section>
  );
});

function Coats({ items, loading }) {
  const [lead, ...rest] = items || [];
  return (
    <section className="section section--screen section--dark" aria-labelledby="coats-h">
      <div className="wrap feature">
        {loading || !lead ? <Skeleton height={520} radius={20} style={{ gridColumn: '1 / -1', opacity: 0.2 }} /> : (
          <>
            <div className="feature__body">
              <h2 id="coats-h">Coats and jackets. <span className="muted">Wool, gabardine and waterproof shells.</span></h2>
              <ul className="feature__rows">
                {[lead, ...rest].slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <Link to={`/product/${p.slug}`} className="feature__row">
                      <span className="feature__thumb frame frame--sq"><ProductImage src={p.colors[0]?.image || p.image} alt="" /></span>
                      <span className="grow"><span className="feature__name">{p.name}</span><span className="feature__brand">{p.brand}</span></span>
                      <span className="price">{priceRange(p.minPrice, p.maxPrice)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/shop/outerwear" className="link feature__more">Shop all outerwear <ArrowRight size={16} className="m-arrow" /></Link>
            </div>
            <Link to={`/product/${lead.slug}`} className="feature__media frame m-zoom" aria-label={`${lead.name}, ${priceRange(lead.minPrice, lead.maxPrice)}`}>
              <ProductImage src={lead.colors[0]?.image || lead.image} alt={`${lead.name} in ${lead.colors[0]?.name || ''}`} />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  useTitle(null);
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: () => api.get('/home'), staleTime: 60_000 });
  return (
    <>
      <Hero />
      <NewIn items={data?.newIn?.slice(0, 4)} loading={isLoading} />
      <Categories />
      <Journey />
      <Coats items={data?.outerwear} loading={isLoading} />
    </>
  );
}
