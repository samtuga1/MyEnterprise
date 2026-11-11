import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Check, Copy, Search, Lock } from 'lucide-react';
import { ProductImage, Skeleton, EmptyState, ErrorNotice } from '../shared/ui/index.jsx';
import { money, number, percent, date, dateTime } from '../shared/format.js';

/* ------------------------------------------------------------ page header */
export function PageHeader({ title, sub, back, actions, eyebrow }) {
  return (
    <header className="a-head">
      <div>
        {back && <Link className="a-head__eyebrow" to={back.to}><ArrowLeft size={15} /> {back.label}</Link>}
        {eyebrow && !back && <div className="a-head__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="a-head__sub">{sub}</p>}
      </div>
      {actions && <div className="a-head__actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, sub, actions, children, flush = false, foot, className = '', as: Tag = 'section', id }) {
  return (
    <Tag className={`a-panel ${flush ? 'a-panel--flush' : ''} ${className}`} id={id}>
      {(title || actions) && (
        <div className="a-panel__head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="muted">{sub}</div>}
          </div>
          {actions && <div className="row" style={{ '--gap': '8px' }}>{actions}</div>}
        </div>
      )}
      <div className="a-panel__body">{children}</div>
      {foot && <div className="a-panel__foot">{foot}</div>}
    </Tag>
  );
}

export const Thumb = ({ src, alt = '', large = false }) => (
  <span className={`a-thumb ${large ? 'a-thumb--lg' : ''}`}><ProductImage src={src} alt={alt} /></span>
);

export function SearchBox({ value, onChange, placeholder = 'Search', label = 'Search' }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  useEffect(() => {
    const t = setTimeout(() => { if (text !== (value || '')) onChange(text.trim()); }, 320);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="a-search">
      <span className="sr-only">{label}</span>
      <Search size={17} aria-hidden="true" />
      <input className="input" type="search" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
    </label>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div style={{ padding: 16, display: 'grid', gap: 14 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {Array.from({ length: cols }).map((__, j) => <Skeleton key={j} height={14} width={j === 0 ? '80%' : '60%'} />)}
        </div>
      ))}
    </div>
  );
}

/** Loading / error / empty wrapper for one query. */
export function QueryView({ query, empty, emptyTitle = 'Nothing here yet', emptyIcon, skeleton, children }) {
  if (query.isLoading) return skeleton || <TableSkeleton />;
  if (query.isError) return <div style={{ padding: 16 }}><ErrorNotice error={query.error} onRetry={() => query.refetch()} /></div>;
  const data = query.data;
  const isEmpty = empty ? empty(data) : Array.isArray(data) ? data.length === 0 : !data;
  if (isEmpty) return <EmptyState title={emptyTitle} icon={emptyIcon} />;
  return children(data);
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="a-switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="a-switch__track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function ReadOnly({ children = 'View only for your role' }) {
  return <span className="a-readonly"><Lock size={13} aria-hidden="true" /> {children}</span>;
}

/* -------------------------------------------------------- formatted values */
export function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  switch (type) {
    case 'money': return money(value);
    case 'percent': return percent(value);
    case 'number': return number(value);
    case 'date': return String(value).length > 10 ? dateTime(value) : date(value);
    default: return String(value);
  }
}

/* ------------------------------------------------------------- code view */
const SQL_KEYWORDS = new Set(('select from where join left right inner outer on and or not in is null as with group by order having limit offset ' +
  'case when then else end distinct union all insert into values update set delete create table procedure function trigger begin ' +
  'declare cursor for open fetch close loop leave if elseif while do return returns signal sqlstate message_text start transaction commit ' +
  'rollback exit continue handler found call after before each row new old exists between like interval day over partition ' +
  'asc desc reads sql data modifies deterministic comment default primary key foreign references unique check constraint ' +
  'cast date resignal into ignore duplicate lock share mode').split(' '));
const SQL_FUNCS = new Set(('sum count avg min max coalesce round concat date datediff timestampdiff now curdate greatest least nullif ' +
  'row_number rank dense_rank field ifnull if lower upper trim format lpad uuid last_insert_id group_concat substring left char_length ' +
  'date_format fn_available_stock fn_returnable_quantity fn_refundable_amount fn_warranty_expires_on fn_payment_refunded_total').split(' '));

/** Tokenises SQL into spans (React elements — never innerHTML). */
export function highlightSql(sql) {
  const out = [];
  const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.|'')*')|(`[^`]*`)|(@[a-z_]+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_'`@-]+|-)/g;
  let m; let i = 0;
  while ((m = re.exec(sql))) {
    const [t] = m;
    if (m[1]) out.push(<span key={i++} className="cm">{t}</span>);
    else if (m[2]) out.push(<span key={i++} className="str">{t}</span>);
    else if (m[4]) out.push(<span key={i++} className="var">{t}</span>);
    else if (m[5]) out.push(<span key={i++} className="num">{t}</span>);
    else if (m[6]) {
      const low = t.toLowerCase();
      if (SQL_KEYWORDS.has(low)) out.push(<span key={i++} className="kw">{t}</span>);
      else if (SQL_FUNCS.has(low) || /^(sp|fn)_/.test(low)) out.push(<span key={i++} className="fn">{t}</span>);
      else out.push(t);
    } else out.push(t);
  }
  return out;
}

export function CodeBlock({ code, title, meta, maxHeight }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  return (
    <div>
      {(title || meta) && (
        <div className="a-code-head">
          <div className="small">{title && <strong>{title}</strong>} {meta && <span className="muted">{meta}</span>}</div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={copy} aria-label="Copy SQL to clipboard">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <pre className="a-code" style={maxHeight ? { maxHeight } : undefined} tabIndex={0}><code>{highlightSql(code || '')}</code></pre>
    </div>
  );
}
