import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Search, X, ArrowRight } from 'lucide-react';
import { api } from '../../shared/api.js';
import { priceRange } from '../../shared/format.js';
import { ProductImage, EASE_ENTER } from '../../shared/ui/index.jsx';

const SUGGESTIONS = ['Linen', 'Denim', 'Boots', 'Merino', 'Trench', 'Tote'];

export default function SearchOverlay({ open, onClose }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const input = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (!open) return undefined;
    setTimeout(() => input.current?.focus(), 40);
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get('/products', { q: debounced, perPage: 6 }),
    enabled: open && debounced.length >= 2,
    placeholderData: (prev) => prev,
  });

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) { onClose(); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="search" role="dialog" aria-modal="true" aria-label="Search"
            initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.34, ease: EASE_ENTER }}>
            <div className="wrap">
              <form className="search__bar" onSubmit={submit} role="search">
                <Search size={22} aria-hidden="true" />
                <label htmlFor="site-search" className="sr-only">Search products</label>
                <input id="site-search" ref={input} className="search__input" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search shirts, boots, merino…" autoComplete="off" />
                {isFetching && <span className="spinner" aria-hidden="true" />}
                <button type="button" className="btn btn--quiet btn--icon" onClick={onClose} aria-label="Close search"><X size={20} /></button>
              </form>
              {debounced.length < 2 ? (
                <div className="search__hints">
                  <p className="label">Popular searches</p>
                  <div className="row">
                    {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => setQ(s)}>{s}</button>)}
                  </div>
                </div>
              ) : (
                <div className="search__results">
                  {data?.items?.length ? (
                    <>
                      <ul className="search__grid">
                        {data.items.map((p) => (
                          <li key={p.id}>
                            <Link to={`/product/${p.slug}`} onClick={onClose} className="search__item m-zoom-parent">
                              <span className="frame frame--45 m-zoom"><ProductImage src={p.image} alt={p.name} /></span>
                              <span className="search__name">{p.name}</span>
                              <span className="small muted">{priceRange(p.minPrice, p.maxPrice)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <Link className="text-link row" style={{ marginTop: 20 }} to={`/search?q=${encodeURIComponent(debounced)}`} onClick={onClose}>
                        See all {data.total} results <ArrowRight size={16} />
                      </Link>
                    </>
                  ) : !isFetching && (
                    <p className="muted" style={{ padding: '24px 0' }}>Nothing matches “{debounced}”. Try a fabric, a colour or a garment.</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
