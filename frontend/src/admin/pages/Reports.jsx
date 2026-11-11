import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Play, ArrowRight, Table2, FileCode2, Timer, Rows3, Download } from 'lucide-react';
import { api } from '../../shared/api.js';
import { moneyShort, percent, number } from '../../shared/format.js';
import { Field, ErrorNotice, EmptyState, Skeleton, useTitle, Spinner } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, CodeBlock, TableSkeleton, formatCell } from '../components.jsx';
import { BarList } from '../charts.jsx';

const useReports = () => useQuery({ queryKey: ['admin-reports'], queryFn: () => api.get('/admin/reports'), staleTime: 300_000 });

export function ReportsIndex() {
  useTitle('Reports', 'MyEnterprise Admin');
  const q = useReports();
  const reduce = useReducedMotion();
  return (
    <>
      <PageHeader title="Business reports" sub="Seven questions the database answers. Each joins at least two tables; the SQL lives in database/queries/ and runs unchanged here and in phpMyAdmin." />
      {q.isLoading ? <div className="a-report-cards">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="a-panel a-report-card"><Skeleton width={40} height={40} radius={12} /><Skeleton height={26} width="80%" /><Skeleton height={14} /><Skeleton height={14} width="70%" /></div>)}</div>
        : q.isError ? <ErrorNotice error={q.error} onRetry={q.refetch} /> : (
          <div className="a-report-cards">
            {q.data.map((r, i) => (
              <motion.div key={r.key} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}>
                <Link to={`/reports/${r.key}`} className="a-panel card a-report-card" style={{ height: '100%' }}>
                  <span className="a-report-card__code">{r.code}</span>
                  <h2>{r.title}</h2>
                  <p>{r.question}</p>
                  <p className="a-report-card__meta">{tablesText(r.tables)}</p>
                  <span className="text-link small row" style={{ '--gap': '6px' }}>Run this report <ArrowRight size={14} /></span>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
    </>
  );
}

const PARAM_META = {
  date_from: { label: 'From', type: 'date' },
  date_to: { label: 'To', type: 'date' },
  buffer: { label: 'Units above reorder level', type: 'number', hint: '0 = at or under the level' },
  only_open: { label: 'Only open claims', type: 'toggle' },
};

const CHARTS = {
  q1: { label: 'category', value: 'revenue', format: moneyShort, title: 'Revenue by category' },
  q2: { label: 'customer', value: 'net_spend', format: moneyShort, title: 'Net spend by customer' },
  q4: { label: 'supplier', value: 'spend', format: moneyShort, title: 'Purchasing spend by supplier' },
  q6: { label: 'product', value: 'return_rate_pct', format: (v) => percent(v), title: 'Return rate by product', limit: 10 },
};

const NUMERIC = ['money', 'percent', 'number'];
const tablesText = (t = '') => t.replace(/^\((\d+)\):\s*/, '$1 tables: ');
const sentence = (t = '') => t.charAt(0).toUpperCase() + t.slice(1);

function toCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n');
}

export function ReportRun() {
  const { key } = useParams();
  const [search, setSearch] = useSearchParams();
  const list = useReports();
  const meta = list.data?.find((r) => r.key === key);
  const defaults = useMemo(() => meta?.defaults || {}, [meta]);
  const applied = useMemo(() => {
    const p = {};
    Object.entries(defaults).forEach(([name, def]) => {
      if (name === 'as_of') return;
      p[name] = search.get(name) ?? (def === null ? '' : String(def));
    });
    return p;
  }, [defaults, search]);
  const [form, setForm] = useState(applied);
  useEffect(() => setForm(applied), [applied]);
  const ready = !!meta;
  const run = useQuery({
    queryKey: ['admin-report', key, applied],
    queryFn: () => api.get(`/admin/reports/${key}`, applied),
    enabled: ready,
    placeholderData: (prev) => (prev?.key === key ? prev : undefined),
    staleTime: 0,
  });
  useTitle(meta ? `${meta.code} ${meta.title}` : 'Report', 'MyEnterprise Admin');
  const data = run.data;
  const info = data || meta;
  const chart = CHARTS[key];

  const submit = (e) => {
    e.preventDefault();
    const next = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null) next.set(k, v); });
    if (next.toString() === new URLSearchParams(applied).toString()) run.refetch();
    else setSearch(next, { replace: true });
  };

  const download = () => {
    const blob = new Blob([toCsv(data.columns, data.rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.code}-${key}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (list.isError) return <ErrorNotice error={list.error} onRetry={list.refetch} />;
  if (list.isLoading) return <><Skeleton width={240} height={40} /><div className="a-gap"><TableSkeleton /></div></>;
  if (!meta) return <EmptyState title="No such report" action={<Link className="btn btn--primary" to="/reports">All reports</Link>} />;

  const fieldErrors = run.error?.fields || {};
  const chartRows = chart && data ? data.rows.slice(0, chart.limit || 15).map((r, i) => ({ key: `${i}`, label: String(r[chart.label]), value: Number(r[chart.value]) || 0, display: chart.format(r[chart.value]) })) : [];

  return (
    <>
      <PageHeader back={{ to: '/reports', label: 'Business reports' }} title={<><span className="a-report-card__code" style={{ marginRight: 14, verticalAlign: 'middle' }}>{info.code}</span>{info.title}</>} />
      <p className="a-question">{info.question}</p>

      <div className="a-facts a-gap-lg">
        <div className="a-fact"><h3>How it is measured</h3><p>{info.definitions}</p></div>
        <div className="a-fact"><h3>Tables joined</h3><p>{tablesText(info.tables)}</p></div>
        <div className="a-fact"><h3>SQL techniques</h3><p>{sentence(info.techniques)}</p></div>
      </div>

      <Panel className="a-gap-lg" title="Parameters" sub="Bound as session variables (SET @name = ?) before the query runs">
        <form className="a-params" onSubmit={submit} noValidate>
          {Object.keys(applied).map((name) => {
            const pm = PARAM_META[name] || { label: name, type: 'text' };
            if (pm.type === 'toggle') {
              return (
                <label key={name} className="check" style={{ minHeight: 42, alignItems: 'center' }}>
                  <input type="checkbox" checked={form[name] === '1'} onChange={(e) => setForm({ ...form, [name]: e.target.checked ? '1' : '0' })} /> {pm.label}
                </label>
              );
            }
            return (
              <Field key={name} label={pm.label} hint={pm.hint} error={fieldErrors[name]}>
                <input className="input" type={pm.type} min={pm.type === 'number' ? 0 : undefined} max={pm.type === 'number' ? 50 : undefined}
                  value={form[name] ?? ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
              </Field>
            );
          })}
          <button className="btn btn--primary" type="submit" disabled={run.isFetching} style={{ minHeight: 42 }}>
            {run.isFetching ? <Spinner label="Running" /> : <Play size={16} />} Run query
          </button>
          {data && (
            <div className="a-runmeta" style={{ marginLeft: 'auto', alignSelf: 'center' }} aria-live="polite">
              <span className="row" style={{ '--gap': '6px' }}><Rows3 size={15} aria-hidden="true" /><strong>{number(data.rowCount)}</strong> rows</span>
              <span className="row" style={{ '--gap': '6px' }}><Timer size={15} aria-hidden="true" /><strong>{data.durationMs}</strong> ms</span>
            </div>
          )}
        </form>
      </Panel>

      {run.isError && <div className="a-gap"><ErrorNotice error={run.error} onRetry={run.refetch} /></div>}

      {chart && data && data.rows.length > 0 && (
        <Panel className="a-gap" title={chart.title} sub={chart.limit && data.rows.length > chart.limit ? `Top ${chart.limit} of ${data.rows.length}; every row is in the table below` : 'The same rows as the table below'}>
          <div style={{ opacity: run.isFetching ? 0.55 : 1, transition: 'opacity 200ms' }}>
            <BarList label={chart.title} rows={chartRows} />
          </div>
        </Panel>
      )}

      <Panel className="a-gap" flush title={<span className="row" style={{ '--gap': '8px' }}><Table2 size={17} aria-hidden="true" /> Result</span>}
        sub={data ? `${number(data.rowCount)} rows · ${data.columns.length} columns` : undefined}
        actions={data && data.rows.length > 0 && <button type="button" className="btn btn--secondary btn--sm" onClick={download}><Download size={15} /> Download CSV</button>}>
        {!data && run.isFetching ? <TableSkeleton cols={6} /> : !data ? null : data.rows.length === 0 ? (
          <EmptyState title="No rows for these parameters">Widen the date range and run it again.</EmptyState>
        ) : (
          <div className="a-table-wrap" style={{ maxHeight: 560, overflow: 'auto', opacity: run.isFetching ? 0.55 : 1, transition: 'opacity 200ms' }}>
            <table className="a-table a-table--compact">
              <thead><tr>{data.columns.map((c) => <th key={c.key} scope="col" className={NUMERIC.includes(c.type) ? 'num' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>{data.rows.map((r, i) => (
                <tr key={i}>{data.columns.map((c) => (
                  <td key={c.key} className={NUMERIC.includes(c.type) ? 'num' : c.key === 'reason' || c.key === 'resolution' ? 'wrap-text small' : ''}>
                    {c.type === 'text' && /^(SUBMITTED|APPROVED|RESOLVED|REJECTED|PLACED|PROCESSING|SHIPPED)$/.test(r[c.key]) ? <span className="badge">{String(r[c.key]).toLowerCase()}</span> : formatCell(r[c.key], c.type)}
                  </td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="a-gap" title={<span className="row" style={{ '--gap': '8px' }}><FileCode2 size={17} aria-hidden="true" /> The SQL</span>}
        sub="Exactly what ran — read from the same file you import in phpMyAdmin">
        {data ? <CodeBlock code={data.sql} title={data.file} meta={`· parameters: ${Object.entries(data.params).map(([k, v]) => `@${k} = ${v === null ? 'NULL' : JSON.stringify(v)}`).join(', ')}`} />
          : <Skeleton height={240} radius={12} />}
      </Panel>
    </>
  );
}

