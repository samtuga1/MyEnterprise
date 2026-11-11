import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useLocation } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, X, SearchX } from 'lucide-react';
import { api } from '../../shared/api.js';
import { number, moneyShort } from '../../shared/format.js';
import { Drawer, EmptyState, ErrorNotice, Pagination, Skeleton, useTitle, EASE } from '../../shared/ui/index.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { useCategories } from '../hooks.js';

const SORTS = [['featured', 'Most popular'], ['new', 'Newest'], ['price_asc', 'Price, low to high'], ['price_desc', 'Price, high to low'], ['name', 'Name, A to Z']];
const list = (v) => (v ? v.split(',').filter(Boolean) : []);
const SIZE_SYSTEMS = [
  ['Clothing', (s) => /^(XXS|XS|S|M|L|XL|XXL)$/.test(s)],
  ['Waist', (s) => /^W\d+/.test(s)],
  ['Shoes (EU)', (s) => /^EU /.test(s)],
  ['Belts', (s) => / cm$/.test(s)],
  ['Other', (s) => !/^(XXS|XS|S|M|L|XL|XXL)$|^W\d+|^EU | cm$/.test(s)],
];

function FilterPanel({ facets, params, update, categories, category }) {
  const sizes = list(params.get('sizes'));
  const colors = list(params.get('colors'));
  const brands = list(params.get('brands'));
  const [min, setMin] = useState(params.get('min') || '');
  const [max, setMax] = useState(params.get('max') || '');
  useEffect(() => { setMin(params.get('min') || ''); setMax(params.get('max') || ''); }, [params]);
  const toggle = (key, values, value) => update({ [key]: (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]).join(',') || null });
  const types = (categories || []).filter((c) => c.group === 'TYPE');
  const dept = category && ['women', 'men'].includes(category) ? category : null;

  return (
    <div className="filters">
      {dept && (
        <fieldset className="filters__group">
          <legend className="filters__title">Category</legend>
          <ul className="filters__links">
            <li><button type="button" className={`filters__link ${!params.get('also') ? 'is-on' : ''}`} onClick={() => update({ also: null })}>All {dept === 'women' ? 'women' : 'men'}</button></li>
            {types.map((t) => (
              <li key={t.slug}><button type="button" className={`filters__link ${params.get('also') === t.slug ? 'is-on' : ''}`} onClick={() => update({ also: t.slug })}>{t.name}</button></li>
            ))}
          </ul>
        </fieldset>
      )}
      {facets?.sizes?.length > 0 && (
        <fieldset className="filters__group">
          <legend className="filters__title">Size</legend>
          {SIZE_SYSTEMS.map(([label, test]) => {
            const group = facets.sizes.filter(test);
            if (!group.length) return null;
            return (
              <div key={label} className="filters__size-group">
                <span className="filters__sub">{label}</span>
                <div className="filters__sizes">
                  {group.map((s) => (
                    <button key={s} type="button" className="size size--sm" aria-checked={sizes.includes(s)} role="checkbox" onClick={() => toggle('sizes', sizes, s)}>
                      {s.replace(/^EU /, '')}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
      )}
      {facets?.colors?.length > 0 && (
        <fieldset className="filters__group">
          <legend className="filters__title">Colour</legend>
          <div className="filters__colors">
            {facets.colors.map((c) => (
              <button key={c.name} type="button" role="checkbox" aria-checked={colors.includes(c.name)} className="filters__color" onClick={() => toggle('colors', colors, c.name)}>
                <span className="swatch" style={{ '--sw': c.hex, width: 22, height: 22 }} aria-hidden="true" aria-pressed={colors.includes(c.name)} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {facets?.brands?.length > 1 && (
        <fieldset className="filters__group">
          <legend className="filters__title">Label</legend>
          {facets.brands.map((b) => (
            <label key={b} className="check"><input type="checkbox" checked={brands.includes(b)} onChange={() => toggle('brands', brands, b)} /> {b}</label>
          ))}
        </fieldset>
      )}
      <fieldset className="filters__group">
        <legend className="filters__title">Price</legend>
        <form className="filters__price" onSubmit={(e) => { e.preventDefault(); update({ min: min || null, max: max || null }); }}>
          <label className="sr-only" htmlFor="price-min">Lowest price</label>
          <input id="price-min" className="input input--sm" inputMode="numeric" placeholder={facets?.price ? `From ${moneyShort(facets.price.min)}` : 'From'} value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))} />
          <label className="sr-only" htmlFor="price-max">Highest price</label>
          <input id="price-max" className="input input--sm" inputMode="numeric" placeholder={facets?.price ? `To ${moneyShort(facets.price.max)}` : 'To'} value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ''))} />
          <button type="submit" className="btn btn--secondary btn--sm">Apply</button>
        </form>
      </fieldset>
      <label className="check filters__group"><input type="checkbox" checked={params.get('inStock') === '1'} onChange={(e) => update({ inStock: e.target.checked ? '1' : null })} /> In stock only</label>
    </div>
  );
}

export default function Shop() {
  const { category } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: categories } = useCategories();
  const isSearch = location.pathname.endsWith('/search');
  const q = params.get('q') || '';

  const query = useMemo(() => ({
    category: category || undefined, q: q || undefined, also: params.get('also') || undefined,
    sizes: params.get('sizes') || undefined, colors: params.get('colors') || undefined, brands: params.get('brands') || undefined,
    min: params.get('min') || undefined, max: params.get('max') || undefined, inStock: params.get('inStock') || undefined,
    sort: params.get('sort') || 'featured', page: params.get('page') || 1, perPage: 12,
  }), [category, q, params]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['products', query], queryFn: () => api.get('/products', query), placeholderData: keepPreviousData,
  });

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === null || v === undefined || v === '' ? next.delete(k) : next.set(k, v)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { preventScrollReset: true });
  };

  const title = isSearch ? (q ? `Results for “${q}”` : 'Search') : data?.category?.name || (category ? '…' : 'Everything');
  const subtitle = data?.also?.name;
  useTitle(isSearch ? `Search: ${q}` : [data?.category?.name, subtitle].filter(Boolean).join(' · ') || 'Shop');

  const chips = [
    ...(subtitle ? [{ key: 'also', label: subtitle, clear: { also: null } }] : []),
    ...list(params.get('sizes')).map((s) => ({ key: `s-${s}`, label: `Size ${s}`, clear: { sizes: list(params.get('sizes')).filter((x) => x !== s).join(',') || null } })),
    ...list(params.get('colors')).map((c) => ({ key: `c-${c}`, label: c, clear: { colors: list(params.get('colors')).filter((x) => x !== c).join(',') || null } })),
    ...list(params.get('brands')).map((b) => ({ key: `b-${b}`, label: b, clear: { brands: list(params.get('brands')).filter((x) => x !== b).join(',') || null } })),
    ...(params.get('min') || params.get('max') ? [{ key: 'price', label: `${params.get('min') ? moneyShort(params.get('min')) : '$0'} – ${params.get('max') ? moneyShort(params.get('max')) : 'any'}`, clear: { min: null, max: null } }] : []),
    ...(params.get('inStock') ? [{ key: 'stock', label: 'In stock', clear: { inStock: null } }] : []),
  ];

  const panel = <FilterPanel facets={data?.facets} params={params} update={update} categories={categories} category={category} />;

  return (
    <div className="shop wrap">
      <header className="shop__head">
        <p className="label">{isSearch ? 'Search' : data?.category?.group === 'DEPARTMENT' ? 'Department' : data?.category?.group === 'COLLECTION' ? 'Collection' : 'Shop'}</p>
        <h1 className="shop__title">{title}{subtitle && <span className="muted"> · {subtitle}</span>}</h1>
        <p className="muted">{data ? `${number(data.total)} ${data.total === 1 ? 'piece' : 'pieces'}` : ' '}</p>
      </header>

      <div className="shop__layout">
        <aside className="shop__aside" aria-label="Filters">{panel}</aside>
        <div className="shop__main">
          <div className="shop__toolbar">
            <button type="button" className="btn btn--secondary btn--sm shop__filters-btn" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={16} /> Filters{chips.length ? ` (${chips.length})` : ''}
            </button>
            <ul className="chips" aria-label="Active filters">
              <AnimatePresence initial={false}>
                {chips.map((c) => (
                  <motion.li key={c.key} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18, ease: EASE }}>
                    <button type="button" className="chip chip--on" onClick={() => update(c.clear)} aria-label={`Remove filter ${c.label}`}>{c.label} <X size={14} /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
              {chips.length > 1 && <li><button type="button" className="text-link small" onClick={() => setParams(q ? { q } : {})}>Clear all</button></li>}
            </ul>
            <label className="shop__sort">
              <span className="sr-only">Sort by</span>
              <select className="select select--sm" value={params.get('sort') || 'featured'} onChange={(e) => update({ sort: e.target.value === 'featured' ? null : e.target.value })}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          <ErrorNotice error={error} onRetry={refetch} />
          {isLoading ? (
            <div className="pgrid" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i}><Skeleton height="auto" style={{ aspectRatio: '4 / 5' }} radius={12} /><Skeleton width="60%" style={{ marginTop: 14 }} /><Skeleton width="35%" style={{ marginTop: 8 }} /></div>)}
            </div>
          ) : data?.items?.length ? (
            <div style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 200ms' }}>
              <ProductGrid products={data.items} eagerCount={3} />
              <Pagination page={data.page} pages={data.pages} onChange={(p) => { update({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          ) : (
            <EmptyState icon={<SearchX />} title="Nothing matches yet"
              action={<Link to="/shop" className="btn btn--secondary">See every piece</Link>}>
              {q ? `No pieces match “${q}”.` : 'No pieces match these filters.'} Remove a filter or try another colour or size.
            </EmptyState>
          )}
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" side="left"
        footer={<button type="button" className="btn btn--primary btn--block" onClick={() => setFiltersOpen(false)}>Show {data ? number(data.total) : ''} pieces</button>}>
        {panel}
      </Drawer>
    </div>
  );
}
