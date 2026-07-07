import { useState, useEffect } from 'react';
import { supabase, type DamageReport } from '../api/client';
import { Loader2, RefreshCw, Plus } from 'lucide-react';

export function DamageReportsPage() {
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Submit new report state
  const [batchCode, setBatchCode] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [source, setSource] = useState<'warehouse_discovered' | 'customer_returned'>('warehouse_discovered');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('damage_reports')
        .select('*, batch:batches(*)')
        .order('created_at', { ascending: false });
      if (data) {
        setReports(data as DamageReport[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchCode.trim() || quantity <= 0 || !reason.trim()) {
      setErrorMsg('All fields are required and quantity must be > 0.');
      return;
    }

    setSubmittingForm(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch('http://localhost:3001/api/damage-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.token}`
        },
        body: JSON.stringify({
          batch_code: batchCode.trim(),
          quantity,
          reason: reason.trim(),
          source
        })
      });

      const result = await response.json();
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        setSuccessMsg(result.data.message);
        setBatchCode('');
        setQuantity(0);
        setReason('');
        await fetchReports();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit report.');
    } finally {
      setSubmittingForm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Damage & Quarantine Reports</h1>
          <p className="text-sm text-slate-500">Record stock damaged on shelf or customer returns.</p>
        </div>
        <button onClick={fetchReports} className="p-2.5 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm">
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Create new report */}
        <div className="md:col-span-1 rounded-2xl bg-white p-6 shadow-md border border-slate-100 h-fit space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Report Damage</h2>
          
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Batch Code</label>
              <input
                type="text"
                value={batchCode}
                onChange={e => setBatchCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs transition focus:border-emerald-500 focus:outline-none"
                placeholder="Scan or enter code..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Damaged Units</label>
              <input
                type="number"
                value={quantity || ''}
                onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs transition focus:border-emerald-500 focus:outline-none"
                placeholder="e.g. 50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Damage Source</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs transition focus:border-emerald-500 focus:outline-none"
              >
                <option value="warehouse_discovered">Warehouse Discovered</option>
                <option value="customer_returned">Customer Returned</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Description / Reason</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs transition focus:border-emerald-500 focus:outline-none"
                rows={2}
                placeholder="Water leak, box crushed..."
                required
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-medium">
                ⚠️ {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="rounded-xl bg-green-50 p-3 text-xs text-green-700 font-medium">
                ✅ {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submittingForm}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
            >
              {submittingForm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Submit Report
            </button>
          </form>
        </div>

        {/* Existing reports track */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Damage Logs</h2>
          {reports.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500 text-sm bg-white">
              No damage reports filed.
            </div>
          ) : (
            reports.map(r => {
              const batch = (r as any).batch;
              return (
                <div key={r.id} className="rounded-2xl bg-white p-5 shadow-md border border-slate-100 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 uppercase">
                        {r.source.replace(/_/g, ' ')}
                      </span>
                      <h4 className="font-bold text-slate-800 font-mono text-sm mt-1">{batch?.batch_code}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-red-600 block">{r.quantity} Units Damaged</span>
                      <span className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-2 font-medium">
                    Reason: {r.reason}
                  </p>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
