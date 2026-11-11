import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, XCircle, PlayCircle, Zap, Workflow, Eye, ShieldCheck } from 'lucide-react';
import { api } from '../../shared/api.js';
import { number } from '../../shared/format.js';
import { Segmented, ErrorNotice, Skeleton, AnimatedNumber, useTitle, Spinner } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, CodeBlock } from '../components.jsx';
import { useParam } from '../lib.jsx';

const TOTALS = [
  ['tables', 'Tables'], ['rows', 'Rows of data'], ['foreignKeys', 'Foreign keys'], ['checks', 'CHECK constraints'],
  ['triggers', 'Triggers'], ['procedures', 'Procedures'], ['functions', 'Functions'], ['cursors', 'Cursors'], ['views', 'Views'],
];

export default function DatabasePage() {
  useTitle('Database', 'MyEnterprise Admin');
  const [tab, setTab] = useParam('tab', 'tables');
  const q = useQuery({ queryKey: ['admin-database'], queryFn: () => api.get('/admin/database'), staleTime: 60_000 });
  const d = q.data;

  return (
    <>
      <PageHeader title="Database" sub={d ? `Live from information_schema on ${d.engine} · database ${d.database}. Thirty tables in eight areas, as in the logical table diagram.` : 'Live from information_schema.'} />
      {q.isError ? <ErrorNotice error={q.error} onRetry={q.refetch} /> : (
        <div className="a-db-totals" aria-busy={q.isLoading}><div className="a-db-totals__grid">
          {TOTALS.map(([k, label]) => (
            <div key={k} className="a-db-total">
              <span className="a-db-total__n">{d ? <AnimatedNumber value={d.totals[k]} format={(v) => number(Math.round(v))} /> : <Skeleton width={48} height={26} />}</span>
              <span className="a-db-total__l">{label}</span>
            </div>
          ))}
        </div></div>
      )}
      <div className="a-tabs a-gap-lg">
        <Segmented label="Database view" layoutId="db-tab" value={tab} onChange={setTab} options={[
          { value: 'tables', label: 'Tables' }, { value: 'triggers', label: 'Triggers', count: d?.totals.triggers },
          { value: 'routines', label: 'Procedures and functions', count: d ? d.totals.procedures + d.totals.functions : undefined },
          { value: 'views', label: 'Views', count: d?.totals.views }, { value: 'integrity', label: 'Integrity checks' },
        ]} />
      </div>
      {!d && !q.isError ? <Skeleton height={400} radius={16} /> : d && (
        tab === 'triggers' ? <Triggers triggers={d.triggers} />
          : tab === 'routines' ? <Routines routines={d.routines} />
            : tab === 'views' ? <Views views={d.views} />
              : tab === 'integrity' ? <Integrity />
                : <Tables domains={d.domains} />
      )}
    </>
  );
}

function Tables({ domains }) {
  const [filter, setFilter] = useState('');
  const f = filter.trim().toLowerCase();
  return (
    <>
      <div className="a-toolbar">
        <label className="a-search"><span className="sr-only">Find a table or column</span>
          <input className="input" type="search" placeholder="Find a table or column" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ paddingLeft: 14 }} /></label>
        <span className="small muted row" style={{ '--gap': '10px' }}>
          <span className="a-keytag a-keytag--pk">PK</span> primary key <span className="a-keytag a-keytag--fk">FK</span> foreign key <span className="a-keytag a-keytag--uq">UQ</span> unique
        </span>
      </div>
      {domains.map((dom) => {
        const tables = dom.tables.filter((t) => !f || t.name.toLowerCase().includes(f) || t.columns.some((c) => c.name.toLowerCase().includes(f)));
        if (!tables.length) return null;
        return (
          <section className="a-domain" key={dom.name} aria-labelledby={`dom-${dom.name}`}>
            <div className="a-domain__head"><h2 id={`dom-${dom.name}`}>{dom.name}</h2><span className="small muted">{tables.length} tables · {number(tables.reduce((s, t) => s + t.rows, 0))} rows</span></div>
            <div className="a-tables">{tables.map((t) => <TableCard key={t.name} table={t} highlight={f} />)}</div>
          </section>
        );
      })}
    </>
  );
}

function TableCard({ table: t, highlight }) {
  const fkCols = new Set(t.foreignKeys.flatMap((k) => k.columns));
  const uqCols = new Set(t.unique.flatMap((u) => u.columns));
  const fkFor = (col) => t.foreignKeys.find((k) => k.columns.includes(col));
  return (
    <article className="a-panel a-dbtable">
      <div className="a-dbtable__head">
        <h3>{t.name === 'CustomerOrder' ? <>CustomerOrder <span className="muted" style={{ fontWeight: 400 }}>(“Order”)</span></> : t.name}</h3>
        <span className="small muted num">{number(t.rows)} rows</span>
      </div>
      {t.comment && <p className="small muted" style={{ padding: '8px 16px 0' }}>{t.comment}</p>}
      <ul className="a-cols">
        {t.columns.map((c) => {
          const pk = t.primaryKey.includes(c.name);
          const fk = fkFor(c.name);
          return (
            <li key={c.name} style={highlight && c.name.toLowerCase().includes(highlight) ? { background: 'var(--accent-soft)' } : undefined}>
              <span>{pk ? <span className="a-keytag a-keytag--pk">PK</span> : fkCols.has(c.name) ? <span className="a-keytag a-keytag--fk">FK</span> : uqCols.has(c.name) ? <span className="a-keytag a-keytag--uq">UQ</span> : null}</span>
              <span className="col-name" title={fk ? `→ ${fk.references}` : undefined}>{c.name}{c.nullable ? <span className="muted">?</span> : ''}{c.extra && c.extra.includes('GENERATED') ? <span className="muted"> · generated</span> : ''}</span>
              <span className="col-type">{c.type}</span>
            </li>
          );
        })}
      </ul>
      {(t.foreignKeys.length > 0 || t.checks.length > 0) && (
        <div className="a-dbtable__extra">
          {t.foreignKeys.length > 0 && (
            <div>
              <h4>References</h4>
              {t.foreignKeys.map((k) => (
                <div key={k.name} className="a-fk"><code>{k.columns.join(', ')}</code> → <code>{k.references}({k.referencedColumns.join(', ')})</code> <span className="muted">on delete {String(k.onDelete).toLowerCase()}</span></div>
              ))}
            </div>
          )}
          {t.checks.length > 0 && (
            <div>
              <h4>CHECK constraints ({t.checks.length})</h4>
              <div className="stack" style={{ '--gap': '4px' }}>
                {t.checks.map((c) => <div key={c.name} className="a-check" title={c.name}><code>{c.clause}</code></div>)}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

const REQUIRED_TRIGGERS = { trg_stock_movement_apply: 'T1', trg_return_item_validate: 'T2', trg_refund_validate: 'T3' };
const CURSOR_PROCS = { sp_checkout_cart: 'Cursor 1', sp_receive_purchase_order: 'Cursor 2', sp_cancel_order: 'Cursor 3', sp_ship_order: 'Cursor 4' };

function Triggers({ triggers }) {
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      <p className="small muted measure">Triggers react to data changes. T1–T3 are the three required triggers; the others protect consistency between tables and keep the stock ledger append-only.</p>
      {[...triggers].sort((a, b) => (REQUIRED_TRIGGERS[b.name] ? 1 : 0) - (REQUIRED_TRIGGERS[a.name] ? 1 : 0) || a.name.localeCompare(b.name)).map((t) => (
        <article key={t.name} className="a-panel a-routine">
          <div className="a-routine__head">
            <Zap size={17} aria-hidden="true" />
            <h3>{t.name}</h3>
            {REQUIRED_TRIGGERS[t.name] && <span className="badge badge--accent badge--plain">{REQUIRED_TRIGGERS[t.name]}</span>}
            <span className="badge badge--plain">{t.timing} {t.event} on {t.table}</span>
          </div>
          <details>
            <summary className="small text-link" style={{ cursor: 'pointer', width: 'max-content' }}>Show the trigger body</summary>
            <div style={{ marginTop: 10 }}><CodeBlock code={t.definition} title={t.name} maxHeight={420} /></div>
          </details>
        </article>
      ))}
    </div>
  );
}

function Routines({ routines }) {
  const sorted = useMemo(() => [...routines].sort((a, b) => (b.cursors > 0) - (a.cursors > 0) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name)), [routines]);
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      <p className="small muted measure">Every procedure owns its transaction (START TRANSACTION … COMMIT, rolled back by an exit handler on any error). Cursor loops sit in their own BEGIN … END block with the NOT FOUND handler.</p>
      {sorted.map((r) => (
        <article key={r.name} className="a-panel a-routine">
          <div className="a-routine__head">
            <Workflow size={17} aria-hidden="true" />
            <h3>{r.name}</h3>
            <span className={`badge badge--plain ${r.type === 'PROCEDURE' ? 'badge--info' : ''}`}>{r.type === 'PROCEDURE' ? 'Procedure' : 'Function'}</span>
            {r.cursors > 0 && <span className="badge badge--accent badge--plain">{CURSOR_PROCS[r.name] || `${r.cursors} cursor`}</span>}
          </div>
          <p className="a-sig">
            {r.name}({r.parameters.map((p) => `${r.type === 'PROCEDURE' ? `${p.mode} ` : ''}${p.name} ${p.type}`).join(', ')}){r.type === 'FUNCTION' && r.returns ? ` RETURNS ${r.returns}` : ''}
          </p>
          {r.comment && <p className="small">{r.comment}</p>}
          <details>
            <summary className="small text-link" style={{ cursor: 'pointer', width: 'max-content' }}>Show the routine body</summary>
            <div style={{ marginTop: 10 }}><CodeBlock code={r.definition} title={r.name} maxHeight={520} /></div>
          </details>
        </article>
      ))}
    </div>
  );
}

function Views({ views }) {
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      {views.map((v) => (
        <article key={v.name} className="a-panel a-routine">
          <div className="a-routine__head"><Eye size={17} aria-hidden="true" /><h3>{v.name}</h3></div>
          <CodeBlock code={v.definition} title={v.name} maxHeight={320} />
        </article>
      ))}
    </div>
  );
}

function Integrity() {
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ['admin-invariants'], queryFn: () => api.get('/admin/database/invariants'), enabled: false });
  const checks = q.data?.checks || [];
  const failing = checks.filter((c) => !c.ok).length;
  return (
    <Panel title={<span className="row" style={{ '--gap': '8px' }}><ShieldCheck size={18} aria-hidden="true" /> Integrity checks</span>}
      sub="Runs database/08_verify_invariants.sql: each rule counts the rows that break it, and every count must be 0."
      actions={<button type="button" className="btn btn--primary" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? <Spinner label="Running checks" /> : <PlayCircle size={17} />} Run integrity checks</button>}>
      {q.isError && <ErrorNotice error={q.error} onRetry={q.refetch} />}
      {!q.data && !q.isFetching && !q.isError && <p className="muted small">Checks stock against the ledger, reservations against open allocations, order totals, payments and refunds, return limits, guarantee dates and purchase receipts.</p>}
      {q.data && (
        <>
          <div className={`notice ${failing ? 'notice--error' : 'notice--ok'}`} role="status" style={{ marginBottom: 12 }}>
            {failing ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{failing ? `${failing} of ${checks.length} rules have violations.` : `All ${checks.length} rules hold.`} Ran in {q.data.durationMs} ms.</span>
          </div>
          <ul className="a-inv">
            {checks.map((c, i) => (
              <motion.li key={c.rule} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: i * 0.025 }}>
                {c.ok ? <CheckCircle2 size={18} color="var(--ok)" aria-label="Holds" /> : <XCircle size={18} color="var(--danger)" aria-label="Violated" />}
                <span>{c.rule}</span>
                <span className={`badge ${c.ok ? 'badge--ok' : 'badge--danger'}`}>{c.ok ? '0 rows' : `${c.violations} rows`}</span>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
