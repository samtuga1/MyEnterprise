// Lightweight SVG charts for the admin, built to the dataviz skill's rules:
// one series = one validated colour (--a-series) and no legend box; 2px lines
// with a 10% area wash; bars at most 24px with a 4px rounded data end and a
// square baseline; solid hairline grid; a crosshair/hover tooltip that is also
// reachable by keyboard; and every chart has a table view.
import { useEffect, useId, useRef, useState } from 'react';

function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Clean axis maximum and step: 0 / 1,000 / 2,000 … */
export function niceScale(max, count = 4) {
  if (!max || max <= 0) return { max: 1, step: 0.25 };
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
  return { max: Math.ceil(max / step) * step, step };
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-US');
const tick = (v, money, scaleMax) => {
  const n = scaleMax >= 10000 ? compact.format(v) : full.format(v);
  return money ? `$${n}` : n;
};

/**
 * Area/line over time. data: [{ x: 'YYYY-MM-DD', y: number, note?: string }]
 */
export function AreaChart({ data, height = 220, money = false, formatValue = (v) => String(v), label, stale = false }) {
  const box = useRef(null);
  const width = useWidth(box);
  const [hot, setHot] = useState(null);
  const id = useId();
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const ys = data.map((d) => Number(d.y) || 0);
  const scale = niceScale(Math.max(0, ...ys));
  const x = (i) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / scale.max) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(d.y) || 0).toFixed(1)}`).join('');
  const area = data.length ? `${line}L${x(data.length - 1).toFixed(1)},${pad.t + ih}L${x(0).toFixed(1)},${pad.t + ih}Z` : '';
  const ticks = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(v);
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 90))));
  const fmtDay = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const pick = (clientX) => {
    const r = box.current.getBoundingClientRect();
    const rel = clientX - r.left - pad.l;
    const i = Math.round((rel / iw) * (data.length - 1));
    setHot(Math.max(0, Math.min(data.length - 1, i)));
  };
  const onKey = (e) => {
    if (!data.length) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setHot((h) => Math.min(data.length - 1, (h ?? -1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHot((h) => Math.max(0, (h ?? data.length) - 1)); }
    if (e.key === 'Escape') setHot(null);
  };
  const peak = ys.length ? ys.indexOf(Math.max(...ys)) : -1;

  return (
    <div ref={box} className={`a-chart ${stale ? 'is-stale' : ''}`} onPointerLeave={() => setHot(null)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t`} tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)} onKeyDown={onKey} onBlur={() => setHot(null)}>
        <title id={`${id}-t`}>{label}. Use the left and right arrow keys to read each day.</title>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end">{tick(v, money, scale.max)}</text>
          </g>
        ))}
        <line className="axis" x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
        {data.map((d, i) => (i % every === 0 || i === data.length - 1) && (i === data.length - 1 || data.length - 1 - i >= every * 0.6) ? (
          <text key={d.x} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{fmtDay(d.x)}</text>
        ) : null)}
        <path className="area" d={area} />
        <path className="line" d={line} />
        {peak >= 0 && hot === null && ys[peak] > 0 && (
          <g>
            <circle className="dot" cx={x(peak)} cy={y(ys[peak])} r={4} />
            <text className="label-strong" x={x(peak)} y={y(ys[peak]) - 10} textAnchor={peak > data.length * 0.85 ? 'end' : peak < data.length * 0.15 ? 'start' : 'middle'}>
              {formatValue(ys[peak])}
            </text>
          </g>
        )}
        {hot !== null && data[hot] && (
          <g>
            <line className="crosshair" x1={x(hot)} x2={x(hot)} y1={pad.t} y2={pad.t + ih} />
            <circle className="dot" cx={x(hot)} cy={y(ys[hot])} r={5} />
          </g>
        )}
      </svg>
      {hot !== null && data[hot] && (
        <div className="a-tip" style={{ left: Math.min(Math.max(x(hot), 70), width - 70), top: y(ys[hot]) }}>
          <strong>{formatValue(ys[hot])}</strong>
          <span><span className="k" />{fmtDay(data[hot].x)}{data[hot].note ? ` · ${data[hot].note}` : ''}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Ranked horizontal bars, one series. rows: [{ label, value, display }]
 * Value printed at the bar's tip; the row is the hover/focus target.
 */
export function BarList({ rows, label, max }) {
  const top = max ?? Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="a-barlist" role="list" aria-label={label}>
      {rows.map((r) => {
        const w = top > 0 ? Math.max(0.6, ((Number(r.value) || 0) / top) * 100) : 0;
        return (
          <div className="a-barlist__row" role="listitem" key={r.key ?? r.label} tabIndex={0} title={`${r.label}: ${r.display}`}>
            <span className="a-barlist__name">{r.label}</span>
            <span className="a-barlist__track">
              <span className="a-barlist__bar" style={{ width: `calc((100% - 104px) * ${(w / 100).toFixed(4)})` }} />
              <span className="a-barlist__value">{r.display}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Capacity meter: on hand and reserved share of capacity. The fill carries
 * severity (accent → warning → danger); the track is a lighter step of the same hue.
 */
export function CapacityMeter({ name, capacity, onHand, reserved }) {
  const used = capacity > 0 ? onHand / capacity : 0;
  const tone = used >= 0.9 ? 'danger' : used >= 0.75 ? 'warn' : '';
  const free = Math.max(0, onHand - reserved);
  return (
    <div className="a-meter">
      <div className="a-meter__top">
        <strong style={{ fontWeight: 500 }}>{name}</strong>
        <span className="num">{full.format(onHand)} / {full.format(capacity)} <span className="muted">({Math.round(used * 100)}%)</span></span>
      </div>
      <div className="a-meter__track" role="meter" aria-label={`${name} capacity used`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={onHand}
        aria-valuetext={`${full.format(onHand)} of ${full.format(capacity)} places used, ${full.format(reserved)} reserved for orders`}>
        {free > 0 && <span className={`a-meter__fill ${tone}`} style={{ width: `${(free / capacity) * 100}%` }} />}
        {reserved > 0 && <span className="a-meter__fill a-meter__fill--reserved" style={{ width: `${Math.max(0.8, (reserved / capacity) * 100)}%` }} />}
      </div>
    </div>
  );
}
