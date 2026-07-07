import { useState, useRef } from 'react';
import { Loader2, Search, Barcode, Package, ShieldAlert } from 'lucide-react';

type BatchResult = {
  type: 'batch';
  batch_code: string;
  product_name: string;
  status: string;
  quantity_produced: number;
  quantity_remaining: number;
  production_date: string;
  expiry_date: string;
  days_remaining: number;
  dispatches?: Array<{
    order_number: string;
    customer: string;
    quantity_units: number;
    date: string;
  }>;
};

type ProductResult = {
  type: 'product';
  product_name: string;
  product_sku: string;
  barcode: string;
  units_per_box: number | null;
  shelf_life_days: number | null;
  is_active: number;
};

type CheckerResult = BatchResult | ProductResult;

export function CheckerPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckerResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      produced_pending_receipt: 'bg-amber-100 text-amber-800',
      produced: 'bg-amber-100 text-amber-800',
      in_stock: 'bg-green-100 text-green-800',
      on_hold: 'bg-red-100 text-red-800 border border-red-200',
      expired: 'bg-slate-100 text-slate-800',
      fully_dispatched: 'bg-blue-100 text-blue-800',
      dispatched: 'bg-blue-100 text-blue-800',
      damaged: 'bg-red-100 text-red-800'
    };
    return classes[status] || 'bg-slate-100 text-slate-700';
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await fetch(`http://localhost:3001/api/checker/${query.trim()}`);
      const resultJson = await response.json();
      
      if (resultJson.error) {
        setErrorMsg(resultJson.error.message);
      } else {
        setResult(resultJson.data as CheckerResult);
      }
    } catch (err) {
      setErrorMsg('Failed to query backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Checker Terminal</h1>
        <p className="text-sm text-slate-500">Trace any batch code or product barcode to see details.</p>
      </div>

      {/* Query search */}
      <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-3 text-sm font-semibold transition focus:border-emerald-500 focus:outline-none"
              placeholder="Scan batch code or product barcode..."
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            Trace
          </button>
        </form>

        {errorMsg && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 font-medium">
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* Product-level result */}
      {result && result.type === 'product' && (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <Package className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="font-bold text-slate-800">{result.product_name}</h2>
              <p className="text-xs text-slate-400">SKU: {result.product_sku} &bull; Barcode: {result.barcode}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 p-3 rounded-lg">
              <span className="text-xs text-slate-400 block">Units/Box</span>
              <span className="font-bold text-lg text-slate-800">{result.units_per_box || '—'}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <span className="text-xs text-slate-400 block">Shelf Life</span>
              <span className="font-bold text-lg text-slate-800">{result.shelf_life_days ? `${result.shelf_life_days}d` : '—'}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <span className="text-xs text-slate-400 block">Status</span>
              <span className={`font-bold text-lg ${result.is_active ? 'text-emerald-600' : 'text-red-600'}`}>
                {result.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Batch-level result */}
      {result && result.type === 'batch' && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Summary Card */}
          <div className="md:col-span-1 space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Batch Summary</h2>
              
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">BATCH CODE</span>
                  <span className="font-mono font-bold text-sm text-slate-800">{result.batch_code}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">PRODUCT</span>
                  <span className="font-bold text-slate-800 text-sm">{result.product_name}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">STATUS</span>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded capitalize mt-1 ${getStatusBadge(result.status)}`}>
                    {result.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-50 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">PRODUCED</span>
                    <span className="font-bold text-slate-800">{result.quantity_produced}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">STOCK REMAINING</span>
                    <span className="font-bold text-emerald-600">{result.quantity_remaining}</span>
                  </div>
                </div>

                <div className="border-t border-slate-50 pt-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Mfg Date:</span>
                    <span className="font-bold text-slate-700">{result.production_date}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Exp Date:</span>
                    <span className="font-bold text-slate-700">{result.expiry_date}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Days to Expiry:</span>
                    <span className={`font-bold ${result.days_remaining <= 10 ? 'text-red-600 font-extrabold' : 'text-slate-700'}`}>
                      {result.days_remaining}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trace History Timeline */}
          <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">Dispatches & Withdrawal Trace</h3>
              
              {!result.dispatches || result.dispatches.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  This batch has no dispatches recorded. All stock remains in warehouse.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-100 pl-6 space-y-6">
                  {result.dispatches.map((d, index) => (
                    <div key={index} className="relative">
                      <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-emerald-500">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">Dispatched {d.quantity_units} Units</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Order: <span className="font-semibold">{d.order_number}</span> &bull; Client: {d.customer}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">{new Date(d.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hold audit checks */}
            {result.status === 'on_hold' && (
              <div className="rounded-2xl bg-red-50 p-6 border border-red-100 flex gap-4">
                <ShieldAlert className="h-8 w-8 text-red-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-red-800 text-sm">Quality Inspection Hold Alert</h4>
                  <p className="text-xs text-red-700 mt-1">This batch has been placed on QA hold and cannot be dispatched to customers.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
