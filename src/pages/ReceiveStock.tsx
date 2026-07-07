import { useState, useEffect, useRef } from 'react';
import { supabase, type Batch } from '../api/client';
import { Loader2, CheckCircle, AlertTriangle, RefreshCw, Barcode } from 'lucide-react';

export function ReceiveStock() {
  const [batchCode, setBatchCode] = useState('');
  const [receivedQty, setReceivedQty] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);

  const batchCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRecentAudits();
    if (batchCodeRef.current) batchCodeRef.current.focus();
  }, []);

  const fetchRecentAudits = async () => {
    try {
      const { data } = await supabase.from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) setRecentAudits(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLookupBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = batchCode.trim();
    if (!code) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setActiveBatch(null);
    setReceivedQty(0);
    setLoadingBatch(true);

    try {
      const { data, error } = await supabase.from('batches')
        .select('*, product:products(*)')
        .eq('batch_code', code)
        .maybeSingle();

      if (error || !data) {
        setErrorMsg(`Batch "${code}" not found in system.`);
      } else {
        const batch = data as Batch;
        if (batch.status !== 'produced_pending_receipt') {
          setErrorMsg(`Batch ${batch.batch_code} has already been processed (Status: ${batch.status}).`);
        } else {
          setActiveBatch(batch);
          setReceivedQty(batch.quantity_produced);
        }
      }
    } catch (err) {
      setErrorMsg('Failed to search database.');
    } finally {
      setLoadingBatch(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!activeBatch) return;
    if (receivedQty < 0) {
      setErrorMsg('Received quantity cannot be negative.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch('http://localhost:3001/api/receiving/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.token}`
        },
        body: JSON.stringify({
          batch_code: activeBatch.batch_code,
          received_quantity: receivedQty
        })
      });

      const result = await response.json();
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        if (result.data.status === 'success') {
          setSuccessMsg(`Batch ${activeBatch.batch_code} confirmed in stock with ${receivedQty} units.`);
        } else {
          setSuccessMsg(`Discrepancy flagged: Expected ${activeBatch.quantity_produced}, received ${receivedQty}.`);
        }
        setActiveBatch(null);
        setBatchCode('');
        setReceivedQty(0);
        fetchRecentAudits();
        if (batchCodeRef.current) batchCodeRef.current.focus();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setActiveBatch(null);
    setBatchCode('');
    setReceivedQty(0);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (batchCodeRef.current) batchCodeRef.current.focus();
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Warehouse Goods Inbound</h1>
        <p className="text-sm text-slate-500">Look up a batch and confirm its received quantity.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* Batch Lookup */}
          <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Find Batch</h2>
            
            <form onSubmit={handleLookupBatch} className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={batchCodeRef}
                  type="text"
                  value={batchCode}
                  onChange={e => setBatchCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-4 text-lg font-semibold transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                  placeholder="Scan or type batch code..."
                  disabled={loadingBatch || submitting}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loadingBatch || submitting || !batchCode.trim()}
                className="rounded-xl bg-slate-800 px-6 py-4 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
              >
                {loadingBatch ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Look Up'}
              </button>
            </form>

            {errorMsg && (
              <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mt-4 flex gap-2 rounded-xl bg-green-50 p-4 text-sm text-green-700 font-medium">
                <CheckCircle className="h-5 w-5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {/* Confirmation Card */}
          {activeBatch && (
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-emerald-500 border-l-4 border-l-emerald-500">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="inline-flex rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 mb-1">Confirm Receipt</span>
                  <h3 className="text-2xl font-bold text-slate-800">{activeBatch.batch_code}</h3>
                  <p className="text-sm text-slate-600 font-medium mt-1">{(activeBatch as any).product?.name}</p>
                  <p className="text-xs text-slate-400 mt-1">Produced: {activeBatch.quantity_produced} units</p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">Quantity Received</label>
                <input
                  type="number"
                  min={0}
                  max={activeBatch.quantity_produced * 2}
                  value={receivedQty}
                  onChange={e => setReceivedQty(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-4 text-2xl font-bold text-center transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                />
                {receivedQty !== activeBatch.quantity_produced && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 font-medium flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>Received quantity ({receivedQty}) differs from expected ({activeBatch.quantity_produced}). Submitting will flag a discrepancy.</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={handleCancel}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReceipt}
                  disabled={submitting}
                  className="flex-[2] rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>Confirm Receipt ({receivedQty} units)</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Audit log */}
        <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 h-fit sticky top-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Activity</h2>
            <button onClick={fetchRecentAudits} className="text-slate-400 hover:text-slate-600 transition">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            {recentAudits.length > 0 ? (
              recentAudits.map((a) => (
                <div key={a.id} className="text-xs border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-700 capitalize">{a.action_type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-slate-400">{new Date(a.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <p className="text-slate-500 line-clamp-2 leading-relaxed">{a.details}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-center py-8 text-xs">No entries recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
