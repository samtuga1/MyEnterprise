import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, Link } from 'react-router';
import { BASE } from '../shared/api.js';
import { Toaster, ErrorBoundary, EmptyState, Spinner } from '../shared/ui/index.jsx';
import { AdminContext, useAdminSession } from './lib.jsx';
import Shell from './layout/Shell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { OrdersList, OrderDetail } from './pages/Orders.jsx';
import { ProductsList, ProductEditor, NewProduct } from './pages/Products.jsx';
import Categories from './pages/Categories.jsx';
import Inventory from './pages/Inventory.jsx';
import { Purchasing, PurchaseOrderDetail, NewPurchaseOrder, SupplierDetail } from './pages/Purchasing.jsx';
import Returns from './pages/Returns.jsx';
import Claims from './pages/Claims.jsx';
import { CustomersList, CustomerDetail } from './pages/Customers.jsx';
import { ReportsIndex, ReportRun } from './pages/Reports.jsx';
import DatabasePage from './pages/Database.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 1),
    },
  },
});

/** Every admin page needs a signed-in staff member; otherwise → sign-in, then back here. */
function RequireAdmin() {
  const session = useAdminSession();
  const location = useLocation();
  if (session.isLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Checking your session" /></div>;
  }
  const admin = session.data?.admin;
  if (!admin) {
    const next = location.pathname + location.search;
    return <Navigate to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  }
  return (
    <AdminContext.Provider value={admin}>
      <Shell />
    </AdminContext.Provider>
  );
}

function NotFound() {
  return (
    <div className="a-notfound">
      <EmptyState title="No admin page at this address" action={<Link className="btn btn--primary" to="/">Back to overview</Link>}>
        The link may be out of date.
      </EmptyState>
    </div>
  );
}

const crumb = (c) => ({ handle: { crumb: c } });

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAdmin />,
    children: [
      { index: true, element: <Dashboard />, ...crumb('Overview') },
      { path: 'orders', element: <OrdersList />, ...crumb('Orders') },
      { path: 'orders/:id', element: <OrderDetail />, ...crumb('Order') },
      { path: 'returns', element: <Returns />, ...crumb('Returns') },
      { path: 'claims', element: <Claims />, ...crumb('Quality claims') },
      { path: 'customers', element: <CustomersList />, ...crumb('Customers') },
      { path: 'customers/:id', element: <CustomerDetail />, ...crumb('Customer') },
      { path: 'products', element: <ProductsList />, ...crumb('Products') },
      { path: 'products/new', element: <NewProduct />, ...crumb('New product') },
      { path: 'products/:id', element: <ProductEditor />, ...crumb('Product') },
      { path: 'categories', element: <Categories />, ...crumb('Categories') },
      { path: 'inventory', element: <Inventory />, ...crumb('Inventory') },
      { path: 'purchasing', element: <Purchasing />, ...crumb('Purchasing') },
      { path: 'purchasing/new', element: <NewPurchaseOrder />, ...crumb('New purchase order') },
      { path: 'purchasing/orders/:id', element: <PurchaseOrderDetail />, ...crumb('Purchase order') },
      { path: 'purchasing/suppliers/:id', element: <SupplierDetail />, ...crumb('Supplier') },
      { path: 'reports', element: <ReportsIndex />, ...crumb('Reports') },
      { path: 'reports/:key', element: <ReportRun />, ...crumb('Report') },
      { path: 'database', element: <DatabasePage />, ...crumb('Database') },
      { path: '*', element: <NotFound />, ...crumb('Not found') },
    ],
  },
], { basename: `${BASE}/admin` });

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <RouterProvider router={router} />
        </Toaster>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export { Outlet };
