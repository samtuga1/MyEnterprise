import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../shared/api.js';

/** Who is signed in, the CSRF token and the bag count. */
export const useSession = () => useQuery({ queryKey: ['session'], queryFn: () => api.get('/session'), staleTime: 60_000 });

export const useCart = () => useQuery({ queryKey: ['cart'], queryFn: () => api.get('/cart'), staleTime: 15_000 });

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories'), staleTime: 300_000 });

/** Bag changes update the bag and the header count together. */
export function useCartMutation(kind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, quantity }) => {
      if (kind === 'add') return api.post('/cart/items', { variantId, quantity });
      if (kind === 'set') return api.patch(`/cart/items/${variantId}`, { quantity });
      return api.delete(`/cart/items/${variantId}`);
    },
    onSuccess: (cart) => {
      qc.setQueryData(['cart'], cart);
      qc.setQueryData(['session'], (s) => (s ? { ...s, cartCount: cart.count } : s));
    },
  });
}

/** Sign in / register / sign out: refresh everything that depends on who you are. */
export function useAuthMutation(path) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post(path, body),
    onSuccess: (session) => {
      qc.setQueryData(['session'], session);
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.removeQueries({ queryKey: ['account'] });
    },
  });
}
