import { useState, useEffect } from 'react';
import { supabase, type QualityHold } from '../api/client';
import { Loader2, RefreshCw, Plus, Lock, Unlock, AlertCircle } from 'lucide-react';

export function QualityHoldsPage() {
  const [holds, setHolds] = useState<QualityHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Placed hold inputs
  const [batchCode, setBatchCode] = useState('');
  const [reason, setReason] = useState('');
  const [statusAction, setStatusAction] = useState<'active' | 'released'>('active');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchHolds();
  }, []);

  const fetchHolds = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('quality_holds')
        .select('*, batch:batches(*)')
        .order('created_at', { ascending: false });
      if (data) {
        setHolds(data as QualityHold[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleHoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchCode.trim() || !reason.trim()) {
      setErrorMsg('All fields are required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch('http://localhost:3001/api/quality-holds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.token}`
        },
        body: JSON.stringify({
          batch_code: batchCode.trim(),
          reason,
          status: statusAction
        })
      });

      const result = await response.json();
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        setSuccessMsg(result.data.message);
        setBatchCode('');
        setReason('');
        await fetchHolds();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Hold update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quality Inspection Holds</h1>
          <p className="text-sm text-slate-500">Lock suspicious batches from order dispatch and trace batch releases.</p>
        </div>
        <button onClick={fetchHolds} className="p-2.5 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm">
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Toggle hold */}
        <div className="md:col-span-1 rounded-2xl bg-white p-6 shadow-md border border-slate-100 h-fit space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Update Hold Status</h2>
          
          <form onSubmit={handleHoldSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Batch Code</label>
              <input
                type="text"
                value={batchCode}
                onChange={e => setBatchCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs transition focus:border-brand-500 focus:outline-none"
                placeholder="Scan or enter code..."
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Inspection Action</label>
              <select
                value={statusAction}
                onChange={e => setStatusAction(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs transition focus:border-brand-500 focus:outline-none"
              >
                <option value="active">⚠️ Lock Batch (Place Hold)</option>
                <option value="released">✅ Release Batch (Free Stock)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Inspection Note / Reason</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs transition focus:border-brand-500 focus:outline-none"
                rows={2}
                placeholder="Microbial check pending, packaging defective..."
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
              disabled={submitting}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Apply Hold Action
            </button>
          </form>
        </div>

        {/* Existing active holds list */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quality Hold Log</h2>
          {holds.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500 text-sm bg-white">
              No quality holds registered. All batches are clear.
            </div>
          ) : (
            holds.map(h => {
              const batch = (h as any).batch;
              const active = h.status === 'active';
              return (
                <div key={h.id} className="rounded-2xl bg-white p-5 shadow-md border border-slate-100 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-2 items-center">
                      {active ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                          <Lock className="h-4.5 w-4.5" />
                        </span>
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600">
                          <Unlock className="h-4.5 w-4.5" />
                        </span>
                      )}
                      <div>
                        <h4 className="font-bold text-slate-800 font-mono text-sm">{batch?.batch_code}</h4>
                        <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded capitalize ${
                          active ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                        }`}>
                          {h.status}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400">{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-medium">
                    Inspection Note: {h.reason}
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
