import { useEffect, useState, useCallback } from 'react';
import { supabase, type Customer } from '../api/client';
import { LoadingState, ErrorState } from '../components/ui';
import { Users as UsersIcon, Eye, MapPin, Phone } from 'lucide-react';

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });
        
      if (res.error) throw res.error;
      setCustomers((res.data ?? []) as Customer[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <UsersIcon className="h-6 w-6 text-brand-500" />
            Customers Directory
          </h1>
          <p className="mt-1 text-sm text-slate-500">Manage customers and view their profiles</p>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading customers..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-6 py-4">Customer Name</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Address</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-semibold">{c.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="h-4 w-4" />
                      {c.phone || '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-500 max-w-xs truncate">
                      <MapPin className="h-4 w-4" />
                      {c.address || '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => window.location.hash = `#/customer/${c.id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-100"
                    >
                      <Eye className="h-4 w-4" />
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
