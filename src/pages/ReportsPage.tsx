import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/ui';
import { BarChart3, TrendingUp, Package, AlertTriangle, Calendar, Archive } from 'lucide-react';

type BatchSummary = {
  id: string;
  batch_code: string;
  status: string;
  quantity_produced: number;
  quantity_remaining: number;
  expiry_date: string;
  product?: { name: string; sku: string };
};

type ProductStock = {
  productId: string;
  productName: string;
  sku: string;
  totalBatches: number;
  totalUnitsInStock: number;
  nearestExpiry: string | null;
};

export function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productStocks, setProductStocks] = useState<ProductStock[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<BatchSummary[]>([]);
  const [batchStatusCounts, setBatchStatusCounts] = useState<Record<string, number>>({});
  const [totalUnits, setTotalUnits] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      const [batchRes, expirRes] = await Promise.all([
        supabase
          .from('batches')
          .select('id, batch_code, status, quantity_produced, quantity_remaining, expiry_date, product_id'),
        supabase
          .from('batches')
          .select('id, batch_code, status, quantity_produced, quantity_remaining, expiry_date, product_id')
          .eq('status', 'in_stock')
          .lte('expiry_date', soonDate)
          .gte('expiry_date', today)
          .order('expiry_date', { ascending: true }),
      ]);

      if (batchRes.error) throw batchRes.error;

      const batches = (batchRes.data ?? []) as any[];
      const expiringBatches = (expirRes.data ?? []) as any[];

      // Fetch products to get names
      const productRes = await supabase.from('products').select('id, name, sku');
      const products: Record<string, { name: string; sku: string }> = {};
      (productRes.data ?? []).forEach((p: any) => { products[p.id] = { name: p.name, sku: p.sku }; });

      // Build product stock summary
      const stockMap: Record<string, ProductStock> = {};
      batches.forEach((b: any) => {
        if (b.status !== 'in_stock') return;
        const prod = products[b.product_id];
        if (!prod) return;
        if (!stockMap[b.product_id]) {
          stockMap[b.product_id] = {
            productId: b.product_id,
            productName: prod.name,
            sku: prod.sku,
            totalBatches: 0,
            totalUnitsInStock: 0,
            nearestExpiry: null,
          };
        }
        const s = stockMap[b.product_id];
        s.totalBatches += 1;
        s.totalUnitsInStock += b.quantity_remaining || 0;
        if (!s.nearestExpiry || b.expiry_date < s.nearestExpiry) {
          s.nearestExpiry = b.expiry_date;
        }
      });

      const stockList = Object.values(stockMap).sort((a, b) => b.totalUnitsInStock - a.totalUnitsInStock);
      setProductStocks(stockList);
      setTotalUnits(stockList.reduce((s, p) => s + p.totalUnitsInStock, 0));

      // Batch status counts
      const statusCounts: Record<string, number> = {};
      batches.forEach((b: any) => {
        statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
      });
      setBatchStatusCounts(statusCounts);

      // Expiring soon with product names attached
      setExpiringSoon(expiringBatches.map((b: any) => ({
        ...b,
        product: products[b.product_id],
      })));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState message="Loading reports..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const statusColors: Record<string, string> = {
    in_stock: 'bg-green-100 text-green-700',
    produced_pending_receipt: 'bg-amber-100 text-amber-700',
    on_hold: 'bg-red-100 text-red-700',
    fully_dispatched: 'bg-blue-100 text-blue-700',
    written_off: 'bg-slate-100 text-slate-500',
    expired: 'bg-red-200 text-red-800',
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <BarChart3 className="h-6 w-6 text-brand-500" />
          WMS Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500">Live warehouse inventory and batch status overview</p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
            <Package className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Units in Stock</p>
            <p className="text-xl font-bold text-slate-900">{totalUnits.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Archive className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500">In-Stock Batches</p>
            <p className="text-xl font-bold text-slate-900">{batchStatusCounts['in_stock'] || 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <Calendar className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Expiring ≤ 30 days</p>
            <p className="text-xl font-bold text-amber-600">{expiringSoon.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500">On QA Hold</p>
            <p className="text-xl font-bold text-red-600">{batchStatusCounts['on_hold'] || 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stock per Product */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <TrendingUp className="h-4 w-4 text-brand-500" />
              Current Stock by Product
            </h2>
          </div>
          <div className="p-5">
            {productStocks.length === 0 ? (
              <EmptyState title="No stock data" message="Receive stock batches to see inventory here." />
            ) : (
              <div className="space-y-3">
                {productStocks.map((p) => {
                  const maxUnits = Math.max(...productStocks.map(x => x.totalUnitsInStock), 1);
                  return (
                    <div key={p.productId}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-slate-700">{p.productName}</span>
                          <span className="ml-2 text-xs text-slate-400 font-mono">{p.sku}</span>
                        </div>
                        <span className="text-slate-500 text-xs">
                          {p.totalUnitsInStock.toLocaleString()} units · {p.totalBatches} batches
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${(p.totalUnitsInStock / maxUnits) * 100}%` }}
                        />
                      </div>
                      {p.nearestExpiry && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Nearest expiry: {new Date(p.nearestExpiry).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Batches Expiring in ≤ 30 Days
            </h2>
          </div>
          <div className="p-5">
            {expiringSoon.length === 0 ? (
              <EmptyState title="No urgent batches" message="All in-stock batches have more than 30 days shelf life." />
            ) : (
              <div className="space-y-2">
                {expiringSoon.map((b) => {
                  const daysLeft = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{b.product?.name ?? '—'}</p>
                        <p className="text-xs text-slate-500 font-mono">{b.batch_code} · {b.quantity_remaining} units remaining</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${daysLeft <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {daysLeft}d left
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Batch status breakdown */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Package className="h-4 w-4 text-slate-400" />
            Batch Status Breakdown
          </h2>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-3">
            {Object.entries(batchStatusCounts).map(([status, count]) => (
              <div key={status} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${statusColors[status] ?? 'bg-slate-100 text-slate-600'}`}>
                <span>{count}</span>
                <span className="capitalize">{status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
