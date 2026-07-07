import { useEffect, useState } from 'react';
import { AuthProvider, useAuth, type PageKey } from './api/auth';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { ProductsPage } from './pages/ProductsPage';
import { LogProduction } from './pages/LogProduction';
import { ReceiveStock } from './pages/ReceiveStock';
import { DiscrepanciesPage } from './pages/DiscrepanciesPage';
import { PickingPage } from './pages/PickingPage';
import { DamageReportsPage } from './pages/DamageReportsPage';
import { QualityHoldsPage } from './pages/QualityHoldsPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { LoadingState } from './components/ui';
import { NotFoundPage } from './pages/NotFoundPage';

const PAGE_TO_HASH: Record<PageKey, string> = {
  dashboard: '#/dashboard',
  customers: '#/customers',
  products: '#/products',
  batches: '#/batches',
  receiving: '#/receiving',
  discrepancies: '#/discrepancies',
  picking: '#/picking',
  damage: '#/damage',
  holds: '#/holds',
  reports: '#/reports',
  users: '#/users',
  audit_log: '#/audit-log',
};

const HASH_TO_PAGE: Record<string, PageKey> = {
  dashboard: 'dashboard',
  customers: 'customers',
  products: 'products',
  batches: 'batches',
  receiving: 'receiving',
  discrepancies: 'discrepancies',
  picking: 'picking',
  damage: 'damage',
  holds: 'holds',
  reports: 'reports',
  users: 'users',
  'audit-log': 'audit_log',
};

function readPageFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { page: 'dashboard' as PageKey, notFound: false };
  const page = HASH_TO_PAGE[hash];
  return page ? { page, notFound: false } : { page: 'dashboard' as PageKey, notFound: true };
}

function AuditLogPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
        const res = await fetch('http://localhost:3001/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` },
          body: JSON.stringify({ table: 'audit_log', action: 'select', order: { field: 'created_at', ascending: false }, limit: 100 }),
        });
        const json = await res.json();
        setEntries(json.data || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><LoadingState message="Loading audit trail..." /></div>;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Full Audit Trail</h1>
      <p className="text-sm text-slate-500 mb-6">Append-only log of every action performed in the system.</p>
      <div className="rounded-2xl bg-white shadow-md ring-1 ring-slate-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-500">Time</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-500">Action</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-500">Entity</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-500">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-slate-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-semibold text-slate-700 capitalize">{e.action_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5 text-slate-500">{e.entity_type} {e.entity_id ? `(${e.entity_id.slice(0, 8)}...)` : ''}</td>
                <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{e.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, permissions } = useAuth();
  const initialRoute = readPageFromHash();
  const [page, setPage] = useState<PageKey>(initialRoute.page);
  const [notFound, setNotFound] = useState(initialRoute.notFound);

  useEffect(() => {
    const onHashChange = () => {
      const route = readPageFromHash();
      setPage(route.page);
      setNotFound(route.notFound);
    };

    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (nextPage: PageKey) => {
    setNotFound(false);
    setPage(nextPage);
    window.location.hash = PAGE_TO_HASH[nextPage];
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState message="Loading 2BFC WMS..." />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (notFound) {
    return (
      <NotFoundPage
        onHome={() => navigate('dashboard')}
        onBack={() => window.history.back()}
      />
    );
  }

  const safePage = permissions.pages.includes(page) ? page : 'dashboard';

  return (
    <AppShell current={safePage} onNavigate={navigate}>
      {safePage === 'dashboard'     && <DashboardPage onNavigate={navigate} />}
      {safePage === 'customers'     && <CustomersPage />}
      {safePage === 'products'      && <ProductsPage />}
      {safePage === 'batches'       && <LogProduction />}
      {safePage === 'receiving'     && <ReceiveStock />}
      {safePage === 'discrepancies' && <DiscrepanciesPage />}
      {safePage === 'picking'       && <PickingPage />}
      {safePage === 'damage'        && <DamageReportsPage />}
      {safePage === 'holds'         && <QualityHoldsPage />}
      {safePage === 'reports'       && <ReportsPage />}
      {safePage === 'users'         && <UsersPage />}
      {safePage === 'audit_log'     && <AuditLogPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
