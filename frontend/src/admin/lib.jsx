import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, setCsrf } from '../shared/api.js';
import { useToast } from '../shared/ui/index.jsx';

/* ---------------------------------------------------------------- session */
export const SESSION_KEY = ['admin-session'];

export function useAdminSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      const s = await api.get('/admin/session');
      setCsrf(s?.csrfToken);
      return s;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

/**
 * Which staff roles may perform an action — mirrors backend/routes.php.
 * ADMINISTRATOR may do everything; the server enforces the same rules (403).
 */
const ACTION_ROLES = {
  catalog: ['CATALOG'],
  inventory: ['OPERATIONS'],
  procurement: ['OPERATIONS'],
  fulfil: ['OPERATIONS'],
  cancelOrder: ['OPERATIONS', 'SUPPORT'],
  reviewReturn: ['OPERATIONS', 'SUPPORT'],
  refundReturn: ['OPERATIONS'],
  decideClaim: ['OPERATIONS', 'SUPPORT'],
};

export function useCan() {
  const admin = useAdmin();
  return useMemo(() => ({
    /** Area visible in navigation (from the API's permission list). */
    see: (area) => !!admin && (admin.role === 'ADMINISTRATOR' || (admin.can || []).includes(area)),
    /** Action allowed for this role. */
    do: (action) => !!admin && (admin.role === 'ADMINISTRATOR' || (ACTION_ROLES[action] || []).includes(admin.role)),
  }), [admin]);
}

/* -------------------------------------------------------------- mutations */
/**
 * A server action with the usual admin behaviour: shows the server's own
 * message on failure (trigger/procedure SIGNAL text), a success toast, and
 * refreshes the given query keys.
 */
export function useAction(fn, { success, invalidate = [], onSuccess, onError } = {}) {
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: key })));
      const msg = typeof success === 'function' ? success(data, vars) : success;
      if (msg) toast(msg);
      onSuccess?.(data, vars);
    },
    onError: (err, vars) => {
      if (err?.status === 401) qc.invalidateQueries({ queryKey: SESSION_KEY });
      if (onError) onError(err, vars);
      if (!err?.fields || !Object.keys(err.fields).length || !onError) toast.error(err?.message || 'That did not work.');
    },
  });
}

/* ------------------------------------------------------- url query params */
/** Read/write one search param, resetting `page` when a filter changes. */
export function useParam(name, fallback = '') {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? fallback;
  const set = (v) => {
    const next = new URLSearchParams(params);
    if (v === '' || v === null || v === undefined || v === fallback) next.delete(name); else next.set(name, String(v));
    if (name !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  return [value, set];
}

/** Debounced text value for search boxes. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Change versus the previous period, as text plus a direction. */
export function delta(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (!p) return c ? { dir: 'up', text: 'New this period' } : { dir: 'flat', text: 'No change' };
  const d = ((c - p) / p) * 100;
  if (Math.abs(d) < 0.5) return { dir: 'flat', text: 'Same as previous period' };
  return { dir: d > 0 ? 'up' : 'down', text: `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}% vs previous period` };
}
