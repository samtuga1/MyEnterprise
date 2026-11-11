import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BASE } from '../shared/api.js';
import { Toaster, ErrorBoundary, Skeleton } from '../shared/ui/index.jsx';
import Layout from './layout/Layout.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import { useSession } from './hooks.js';

const Product = lazy(() => import('./pages/Product.jsx'));
const Bag = lazy(() => import('./pages/Bag.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Thanks = lazy(() => import('./pages/Thanks.jsx'));
const SignIn = lazy(() => import('./pages/SignIn.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const OrderDetail = lazy(() => import('./pages/OrderDetail.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 1 && !(err?.status >= 400 && err?.status < 500),
    },
  },
});

function PageFallback() {
  return (
    <div className="wrap" style={{ paddingTop: 'calc(var(--nav) + 48px)', paddingBottom: 96 }} aria-busy="true">
      <Skeleton width="40%" height={44} />
      <Skeleton width="65%" height={18} style={{ marginTop: 16 }} />
      <Skeleton height={360} style={{ marginTop: 32 }} radius={12} />
    </div>
  );
}

/** Pages that need a signed-in customer send guests to sign in, then back. */
function RequireCustomer({ children }) {
  const { data, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <PageFallback />;
  if (!data?.customer) return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

const lazyPage = (Page, guard = false) => {
  const content = <Suspense fallback={<PageFallback />}><Page /></Suspense>;
  return guard ? <RequireCustomer>{content}</RequireCustomer> : content;
};

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <ErrorBoundary><Layout /></ErrorBoundary>,
    children: [
      { index: true, element: <Home /> },
      { path: 'shop', element: <Shop /> },
      { path: 'shop/:category', element: <Shop /> },
      { path: 'search', element: <Shop /> },
      { path: 'product/:slug', element: lazyPage(Product) },
      { path: 'bag', element: lazyPage(Bag) },
      { path: 'checkout', element: lazyPage(Checkout, true) },
      { path: 'order/:number/thanks', element: lazyPage(Thanks, true) },
      { path: 'sign-in', element: lazyPage(SignIn) },
      { path: 'register', element: lazyPage(Register) },
      { path: 'account', element: lazyPage(Account, true) },
      { path: 'account/settings', element: lazyPage(Settings, true) },
      { path: 'account/orders/:number', element: lazyPage(OrderDetail, true) },
      { path: '*', element: lazyPage(NotFound) },
    ],
  },
], { basename: BASE || '/' });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>
  );
}
