import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, Component, cloneElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CheckCircle2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { asset } from '../api.js';
import { statusLabel, statusTone } from '../format.js';

const EASE = [0.2, 0.8, 0.2, 1];
const EASE_ENTER = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ title */
export function useTitle(title, suffix = 'MyEnterprise') {
  useEffect(() => {
    document.title = title ? `${title} · ${suffix}` : suffix;
  }, [title, suffix]);
}

/* ----------------------------------------------------------------- toasts */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function Toaster({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone || 'ok', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 4200);
  }, []);
  const toast = useCallback((message, opts) => push(message, opts), [push]);
  toast.error = (message, opts) => push(message, { ...opts, tone: 'error' });
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div key={t.id} className={`toast ${t.tone === 'error' ? 'toast--error' : ''}`} layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }} transition={{ duration: 0.28, ease: EASE_ENTER }}>
              <span className="toast__icon">{t.tone === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</span>
              <span className="toast__body">{t.message}</span>
              {t.action && <button type="button" className="toast__action" onClick={t.action.onClick}>{t.action.label}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/* ----------------------------------------------------------- focus trap */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function useDialogBehaviour(open, onClose, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE);
    setTimeout(() => (first || node)?.focus(), 30);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const [a, b] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ------------------------------------------------------------------ modal */
export function Modal({ open, onClose, title, children, footer, wide = false, description }) {
  const ref = useRef(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  useDialogBehaviour(open, onClose, ref);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div ref={ref} className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            initial={reduce ? { opacity: 0, x: '-50%', y: '-50%' } : { opacity: 0, x: '-50%', y: 'calc(-50% + 14px)', scale: 0.98 }}
            animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 'calc(-50% + 8px)', transition: { duration: 0.14 } }}
            transition={{ duration: 0.32, ease: EASE_ENTER }}>
            <div className="modal__head">
              <h2 id={titleId}>{title}</h2>
              <button type="button" className="btn btn--quiet btn--icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
            </div>
            {description && <p className="muted" style={{ padding: '6px 24px 0' }}>{description}</p>}
            <div className="modal__body">{children}</div>
            {footer && <div className="modal__foot">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ----------------------------------------------------------------- drawer */
export function Drawer({ open, onClose, title, children, footer, side = 'right' }) {
  const ref = useRef(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  useDialogBehaviour(open, onClose, ref);
  const from = side === 'right' ? '100%' : '-100%';
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
          <motion.aside ref={ref} className="drawer" style={side === 'left' ? { left: 0, right: 'auto' } : undefined}
            role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { x: from }} animate={{ x: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { x: from }}
            transition={{ duration: 0.36, ease: EASE_ENTER }}>
            <div className="drawer__head">
              <h2 id={titleId} style={{ fontSize: 28 }}>{title}</h2>
              <button type="button" className="btn btn--quiet btn--icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="drawer__body">{children}</div>
            {footer && <div className="drawer__foot">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------------------------------------------ field */
export function Field({ label, hint, error, children, className = '' }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={`field ${className}`}>
      <label className="field__label" htmlFor={children?.props?.id || id}>{label}</label>
      {control}
      {hint && !error && <span id={hintId} className="field__hint">{hint}</span>}
      {error && <span id={errorId} className="field__error">{error}</span>}
    </div>
  );
}

/** Form state with server-side field errors (ApiError.fields). */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (name) => (e) => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((s) => ({ ...s, [name]: v }));
    if (errors[name]) setErrors((s) => ({ ...s, [name]: undefined }));
  };
  const fromError = (err) => {
    setErrors(err?.fields || {});
    setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 30);
  };
  return { values, setValues, errors, setErrors, set, fromError };
}

/* ------------------------------------------------------------------ badge */
export function StatusBadge({ status, label }) {
  const tone = statusTone(status);
  return <span className={`badge ${tone === 'plain' ? '' : `badge--${tone}`}`}>{label || statusLabel(status)}</span>;
}

/* ---------------------------------------------------------- product image */
export function ProductImage({ src, alt, className = '', eager = false, style }) {
  const [failed, setFailed] = useState(false);
  return (
    <img className={className} style={style} src={failed ? asset(null) : asset(src)} alt={alt}
      loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} draggable="false" />
  );
}

/* ---------------------------------------------------------------- loading */
export function Skeleton({ width = '100%', height = 16, radius, style }) {
  return <span className="skeleton" aria-hidden="true" style={{ display: 'block', width, height, borderRadius: radius, ...style }} />;
}
export const Spinner = ({ label = 'Loading' }) => <span className="spinner" role="status" aria-label={label} />;

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && <span className="empty__icon" aria-hidden="true">{icon}</span>}
      <h2>{title}</h2>
      {children && <p className="muted measure">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice notice--error" role="alert">
      <AlertCircle size={18} style={{ flex: 'none', marginTop: 2 }} />
      <div className="grow">{error.message || 'Something went wrong.'}</div>
      {onRetry && <button type="button" className="btn btn--sm btn--secondary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(error); } // eslint-disable-line no-console
  render() {
    if (this.state.error) {
      return (
        <div className="wrap" style={{ padding: '120px var(--gut)' }}>
          <EmptyState icon={<AlertCircle />} title="This page hit a problem"
            action={<button className="btn btn--primary" type="button" onClick={() => window.location.reload()}>Reload the page</button>}>
            The rest of the site still works. Reloading usually fixes it.
          </EmptyState>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ----------------------------------------------------- segmented control */
export function Segmented({ value, onChange, options, label, layoutId }) {
  const fallbackId = useId();
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={active} className={active ? 'is-active' : ''} onClick={() => onChange(o.value)}>
            {active && <motion.span layoutId={layoutId || fallbackId} className="segmented__pill" transition={{ duration: 0.24, ease: EASE }} />}
            <span>{o.label}{o.count !== undefined && <span className="muted" style={{ marginLeft: 6 }}>{o.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- pagination */
export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <nav className="row" aria-label="Pages" style={{ justifyContent: 'center', marginTop: 'var(--s-6)' }}>
      <button type="button" className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} /> Previous
      </button>
      <span className="small muted num">Page {page} of {pages}</span>
      <button type="button" className="btn btn--secondary btn--sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next <ChevronRight size={16} />
      </button>
    </nav>
  );
}

/* ---------------------------------------------------------- confirm dialog */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', danger = false, busy = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Keep it</button>
        <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />} {confirmLabel}
        </button>
      </>}>
      {children}
    </Modal>
  );
}

/** A number that eases to its new value (respects reduced motion). */
export function AnimatedNumber({ value, format = (v) => v, duration = 700 }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) { setShown(value); return undefined; }
    const start = performance.now();
    const a = Number(from.current) || 0;
    const b = Number(value) || 0;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (b - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, duration]);
  return <>{format(shown)}</>;
}

export { EASE, EASE_ENTER };
