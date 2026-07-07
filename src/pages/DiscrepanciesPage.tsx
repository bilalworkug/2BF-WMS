import { useState, useEffect } from 'react';
import { supabase, type ReceiptDiscrepancy } from '../api/client';
import { Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

export function DiscrepanciesPage() {
  const [discrepancies, setDiscrepancies] = useState<ReceiptDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState<Record<string, string>>({});
  const [approvedQty, setApprovedQty] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchDiscrepancies();
  }, []);

  const fetchDiscrepancies = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('receipt_discrepancies')
        .select('*, batch:batches(*)')
        .order('created_at', { ascending: false });
      if (data) {
        setDiscrepancies(data as ReceiptDiscrepancy[]);
        // Initialize default inputs
        const notes: Record<string, string> = {};
        const qtys: Record<string, string> = {};
        data.forEach((d: any) => {
          notes[d.id] = '';
          qtys[d.id] = String(d.actual_quantity);
        });
        setResolutionNote(notes);
        setApprovedQty(qtys);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string, action: 'approve' | 'reject') => {
    const note = resolutionNote[id];
    if (!note || note.trim().length < 5) {
      setErrorMsg('Please enter a resolution note (minimum 5 characters).');
      return;
    }

    const qty = parseInt(approvedQty[id]);
    if (action === 'approve' && (isNaN(qty) || qty <= 0)) {
      setErrorMsg('Please enter a valid approved quantity.');
      return;
    }

    setSubmittingId(id);
    setErrorMsg(null);

    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch(`http://localhost:3001/api/receiving/discrepancies/${id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.token}`
        },
        body: JSON.stringify({
          action,
          resolution_note: note,
          approved_quantity: qty
        })
      });

      const result = await response.json();
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        // Reload
        await fetchDiscrepancies();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Resolution failed.');
    } finally {
      setSubmittingId(null);
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
          <h1 className="text-2xl font-bold text-slate-900">Receipt Discrepancies</h1>
          <p className="text-sm text-slate-500">Approve or reject stock quantity discrepancies flagged during warehouse receiving.</p>
        </div>
        <button onClick={fetchDiscrepancies} className="p-2.5 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm">
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 font-medium">
          ❌ {errorMsg}
        </div>
      )}

      <div className="space-y-4">
        {discrepancies.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500 text-sm">
            No discrepancies found. All received batches match production quantities.
          </div>
        ) : (
          discrepancies.map(d => {
            const batch = (d as any).batch;
            const pending = d.status === 'pending_approval';
            return (
              <div key={d.id} className="rounded-2xl bg-white p-6 shadow-md border border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* Meta Column */}
                <div className="md:col-span-1 space-y-2">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    d.status === 'pending_approval' ? 'bg-amber-100 text-amber-800' :
                    d.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {d.status.replace(/_/g, ' ')}
                  </span>
                  <h3 className="font-bold text-slate-800 font-mono text-sm block">{batch?.batch_code}</h3>
                  <p className="text-[10px] text-slate-400">Flagged at: {new Date(d.created_at).toLocaleString()}</p>
                </div>

                {/* Info Column */}
                <div className="md:col-span-1 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-50 pb-1">
                    <span className="text-slate-400 font-medium">Expected Qty:</span>
                    <span className="font-bold text-slate-800">{d.expected_quantity}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-1">
                    <span className="text-slate-400 font-medium">Actual Received:</span>
                    <span className="font-bold text-red-600">{d.actual_quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Variance:</span>
                    <span className="font-bold text-red-600">{d.actual_quantity - d.expected_quantity}</span>
                  </div>
                </div>

                {/* Actions / Resolution Notes */}
                <div className="md:col-span-2 space-y-3">
                  {pending ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Approved Quantity</label>
                          <input
                            type="number"
                            value={approvedQty[d.id] || ''}
                            onChange={e => setApprovedQty({ ...approvedQty, [d.id]: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Resolution Note</label>
                          <input
                            type="text"
                            value={resolutionNote[d.id] || ''}
                            onChange={e => setResolutionNote({ ...resolutionNote, [d.id]: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
                            placeholder="Reason for decision..."
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleResolve(d.id, 'reject')}
                          disabled={submittingId !== null}
                          className="flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject Count
                        </button>
                        <button
                          onClick={() => handleResolve(d.id, 'approve')}
                          disabled={submittingId !== null}
                          className="flex items-center gap-1 text-[11px] font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition"
                        >
                          {submittingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Approve Quantity
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Resolution Details</p>
                      <p className="text-slate-600 mt-1 font-medium">{d.resolution_note || 'No notes provided.'}</p>
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
