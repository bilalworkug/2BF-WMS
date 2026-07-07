import { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/client';
import { Loader2, Search, Barcode, Calendar, FileText, ArrowRight, ShieldAlert, Award } from 'lucide-react';

type BatchTimeline = {
  batch_code: string;
  product_name: string;
  status: string;
  quantity_produced: number;
  quantity_remaining: number;
  production_date: string;
  expiry_date: string;
  days_remaining: number;
  dispatches: Array<{
    order_number: string;
    customer: string;
    quantity_units: number;
    date: string;
  }>;
};

export function CheckerPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<BatchTimeline | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setTimeline(null);

    try {
      const response = await fetch(`http://localhost:3001/api/checker/${query.trim()}`);
      const result = await response.json();
      
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        setTimeline(result.data as BatchTimeline);
      }
    } catch (err) {
      setErrorMsg('Failed to query backend server.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      produced_pending_receipt: 'bg-amber-100 text-amber-800',
      in_stock: 'bg-green-100 text-green-800',
      on_hold: 'bg-red-100 text-red-800 border border-red-200',
      expired: 'bg-slate-100 text-slate-800',
      fully_dispatched: 'bg-blue-100 text-blue-800'
    };
    return classes[status] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Checker Terminal</h1>
        <p className="text-sm text-slate-500">Trace the end-to-end lifecycle, quality controls, and dispatch locations of any batch.</p>
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
              className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-3 text-sm font-semibold transition focus:border-brand-500 focus:outline-none"
              placeholder="Scan or enter barcode batch code (e.g. BFC-260707-001)..."
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5"
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

      {/* Timeline display */}
      {timeline && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
          
          {/* Summary Card */}
          <div className="md:col-span-1 space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Batch Summary</h2>
              
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">PRODUCT</span>
                  <span className="font-bold text-slate-800 text-sm">{timeline.product_name}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">STATUS</span>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded capitalize mt-1 ${getStatusBadge(timeline.status)}`}>
                    {timeline.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-50 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">PRODUCED</span>
                    <span className="font-bold text-slate-800">{timeline.quantity_produced}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">STOCK REMAINING</span>
                    <span className="font-bold text-brand-600">{timeline.quantity_remaining}</span>
                  </div>
                </div>

                <div className="border-t border-slate-50 pt-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Mfg Date:</span>
                    <span className="font-bold text-slate-700">{timeline.production_date}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Exp Date:</span>
                    <span className="font-bold text-slate-700">{timeline.expiry_date}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Days to Expiry:</span>
                    <span className={`font-bold ${timeline.days_remaining <= 10 ? 'text-red-600 font-extrabold' : 'text-slate-700'}`}>
                      {timeline.days_remaining}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trace History Timeline */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Timeline track */}
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">Dispatches & Withdrawal Trace</h3>
              
              {timeline.dispatches.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  This batch has no dispatches recorded. All stock remains in warehouse.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-100 pl-6 space-y-6">
                  {timeline.dispatches.map((d, index) => (
                    <div key={index} className="relative">
                      {/* Node point */}
                      <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-brand-500">
                        <span className="h-2 w-2 rounded-full bg-brand-500" />
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
            {timeline.status === 'on_hold' && (
              <div className="rounded-2xl bg-red-50 p-6 border border-red-100 flex gap-4">
                <ShieldAlert className="h-8 w-8 text-red-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-red-800 text-sm">Quality Inspection Hold Alert</h4>
                  <p className="text-xs text-red-700 mt-1">This batch has been placed on QA hold and cannot be dispatched to customers. Verify holds panel to request release approval.</p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
