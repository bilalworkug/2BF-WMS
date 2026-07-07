import { useEffect, useState, useCallback } from 'react';
import { supabase, type Customer, type Order, type OrderLine } from '../api/client';
import { LoadingState, ErrorState, Badge } from '../components/ui';
import { Phone, MapPin, ArrowLeft, Package, Calendar, Activity, CheckCircle, TrendingUp, Clock } from 'lucide-react';

const statusColors: Record<string, 'amber' | 'blue' | 'green' | 'red'> = {
  pending: 'amber',
  ready_to_pick: 'blue',
  partially_fulfilled: 'blue',
  dispatched: 'green',
  cancelled: 'red',
};

export function CustomerProfilePage({ customerId, onBack }: { customerId: string, onBack: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [custRes, ordRes] = await Promise.all([
        supabase.from('customers').eq('id', customerId).single(),
        supabase.from('orders').eq('customer_id', customerId).order('order_date', { ascending: false })
      ]);

      if (custRes.error) throw custRes.error;
      const c = custRes.data as Customer;
      setCustomer(c);
      
      if (ordRes.error) throw ordRes.error;
      const o = (ordRes.data ?? []) as Order[];
      setOrders(o);

      if (o.length > 0) {
        const orderIds = o.map(x => x.id);
        // Our mock backend supports .in('order_id', [...])
        const linesRes = await supabase.from('order_lines').in('order_id', orderIds);
        if (!linesRes.error) {
          setOrderLines((linesRes.data ?? []) as OrderLine[]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer profile');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState message="Loading customer profile..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!customer) return <ErrorState message="Customer not found" onRetry={load} />;

  // CRM Metrics computation
  const totalOrders = orders.length;
  const totalUnits = orderLines.reduce((sum, line) => sum + line.quantity_units, 0);
  const totalFulfilled = orderLines.reduce((sum, line) => sum + line.quantity_fulfilled_units, 0);
  const fulfillmentRate = totalUnits > 0 ? Math.round((totalFulfilled / totalUnits) * 100) : 0;
  
  const lastActiveOrder = orders.find(o => o.status !== 'cancelled');
  const lastActiveDate = lastActiveOrder ? new Date(lastActiveOrder.order_date).toLocaleDateString() : 'Never';

  // Get initials for Avatar
  const initials = customer.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <button 
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Directory
      </button>

      {/* Modern Profile Header */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="h-32 bg-gradient-to-r from-brand-600 to-brand-400"></div>
        <div className="relative px-6 pb-6 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between">
            <div className="-mt-12 flex items-end space-x-5">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-slate-900 text-3xl font-bold text-white shadow-md">
                {initials}
              </div>
              <div className="pb-1">
                <h1 className="text-3xl font-bold text-slate-900">{customer.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {customer.phone || 'No Phone'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {customer.address || 'No Address'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3 sm:mt-0 sm:pb-1">
              <Badge color={totalOrders > 5 ? 'blue' : 'green'} className="px-3 py-1 text-sm shadow-sm">
                {totalOrders > 5 ? 'VIP Customer' : 'Active Account'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold ${
              activeTab === 'overview'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold ${
              activeTab === 'history'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Order History
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Orders</p>
                  <p className="text-2xl font-bold text-slate-900">{totalOrders}</p>
                </div>
              </div>
            </div>
            
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Units Purchased</p>
                  <p className="text-2xl font-bold text-slate-900">{totalUnits.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Fulfillment Rate</p>
                  <p className="text-2xl font-bold text-slate-900">{fulfillmentRate}%</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Last Active</p>
                  <p className="text-lg font-bold text-slate-900">{lastActiveDate}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity Panel */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Activity className="h-5 w-5 text-slate-400" />
                Recent Orders Summary
              </h3>
            </div>
            <div className="px-6 py-4">
              {orders.length === 0 ? (
                <p className="text-sm text-slate-500">No recent activity.</p>
              ) : (
                <div className="space-y-4">
                  {orders.slice(0, 3).map(o => (
                    <div key={o.id} className="flex items-center justify-between border-l-2 border-brand-200 pl-4 py-1">
                      <div>
                        <p className="font-semibold text-slate-800">{o.order_number}</p>
                        <p className="text-sm text-slate-500">{new Date(o.order_date).toLocaleDateString()}</p>
                      </div>
                      <Badge color={statusColors[o.status] || 'amber'}>
                        {o.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-6 py-4">Order Number</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-semibold text-brand-600 font-mono">
                    {o.order_number}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Calendar className="h-4 w-4" />
                      {new Date(o.order_date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge color={statusColors[o.status] || 'amber'}>
                      {o.status.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => window.location.hash = `#/order/${o.id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-brand-600"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No orders found for this customer.
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
