import { useState, useEffect } from 'react';
import { supabase, type Order, type OrderLine } from '../api/client';
import { Loader2, ClipboardList, CheckCircle2, CornerDownRight, Package, ArrowRight, X } from 'lucide-react';

type PickSuggestion = {
  product_name: string;
  product_code: string;
  needed_units: number;
  batches: Array<{
    batch_code: string;
    batch_id: string;
    expiry_date: string;
    quantity_remaining: number;
    suggested_pull: number;
  }>;
};

type FulfillEntry = {
  order_line_id: string;
  batch_id: string;
  batch_code: string;
  product_name: string;
  quantity_units: number;
};

export function PickingPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [pickSuggestions, setPickSuggestions] = useState<PickSuggestion[]>([]);
  
  // Fulfillment entry state
  const [fulfillEntries, setFulfillEntries] = useState<FulfillEntry[]>([]);
  const [submittingPick, setSubmittingPick] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('orders')
        .select('*, customer:customers(*)')
        .neq('status', 'dispatched')
        .neq('status', 'cancelled')
        .order('order_date');
      if (data) {
        setOrders(data as Order[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectOrder = async (order: Order) => {
    setSelectedOrder(order);
    setErrorMsg(null);
    setSuccessMsg(null);
    setFulfillEntries([]);
    
    try {
      const { data: lines } = await supabase.from('order_lines')
        .select('*, product:products(*)')
        .eq('order_id', order.id);
      
      if (lines) {
        setOrderLines(lines as OrderLine[]);
      }

      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch(`http://localhost:3001/api/orders/${order.id}/pick-suggestion`, {
        headers: { 'Authorization': `Bearer ${stored.token}` }
      });
      const result = await response.json();
      if (result.data) {
        // Map batch_id into suggestions from server
        const suggestions = await mapBatchIds(result.data as any[]);
        setPickSuggestions(suggestions);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const mapBatchIds = async (suggestions: any[]): Promise<PickSuggestion[]> => {
    // Fetch all batches to map batch_code -> id
    const { data: allBatches } = await supabase.from('batches').select('id, batch_code');
    const batchMap = new Map((allBatches || []).map((b: any) => [b.batch_code, b.id]));
    
    return suggestions.map((s: any) => ({
      ...s,
      batches: s.batches.map((b: any) => ({
        ...b,
        batch_id: batchMap.get(b.batch_code) || ''
      }))
    }));
  };

  const addEntry = (suggestion: PickSuggestion, batchIdx: number) => {
    const batch = suggestion.batches[batchIdx];
    if (!batch) return;
    
    // Find matching order line
    const line = orderLines.find(l => 
      l.product_id && l.quantity_units > 0 && 
      (suggestion.product_code === (l as any).product?.sku)
    );
    if (!line) {
      setErrorMsg(`Could not find order line for product ${suggestion.product_name}`);
      return;
    }

    const existing = fulfillEntries.find(e => e.order_line_id === line.id && e.batch_id === batch.batch_id);
    if (existing) {
      setErrorMsg(`Already adding from batch ${batch.batch_code}. Remove it first to change quantity.`);
      return;
    }

    setFulfillEntries(prev => [...prev, {
      order_line_id: line.id,
      batch_id: batch.batch_id,
      batch_code: batch.batch_code,
      product_name: suggestion.product_name,
      quantity_units: Math.min(batch.suggested_pull, batch.quantity_remaining, suggestion.needed_units)
    }]);
    setErrorMsg(null);
  };

  const updateEntryQty = (index: number, qty: number) => {
    setFulfillEntries(prev => prev.map((e, i) => i === index ? { ...e, quantity_units: Math.max(1, qty) } : e));
  };

  const removeEntry = (index: number) => {
    setFulfillEntries(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirmFulfill = async () => {
    if (!selectedOrder || fulfillEntries.length === 0) {
      setErrorMsg('Add at least one batch fulfillment entry.');
      return;
    }

    setSubmittingPick(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      
      // Fulfill each entry sequentially
      let totalFulfilled = 0;
      let totalErrors = 0;

      for (const entry of fulfillEntries) {
        const response = await fetch(`http://localhost:3001/api/orders/${selectedOrder.id}/fulfill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${stored.token}`
          },
          body: JSON.stringify({
            order_line_id: entry.order_line_id,
            batch_id: entry.batch_id,
            quantity_units: entry.quantity_units
          })
        });

        const result = await response.json();
        if (result.error) {
          totalErrors++;
          setErrorMsg(result.error.message);
        } else {
          totalFulfilled += result.data.fulfilled;
        }
      }

      if (totalErrors === 0) {
        setSuccessMsg(`✅ ${totalFulfilled} units dispatched for ${selectedOrder.order_number}.`);
      } else {
        setSuccessMsg(`⚠️ ${totalFulfilled} units dispatched, ${totalErrors} entries failed.`);
      }

      setFulfillEntries([]);
      await selectOrder(selectedOrder);
      await fetchOrders();
    } catch (err: any) {
      setErrorMsg(err.message || 'Fulfillment request failed.');
    } finally {
      setSubmittingPick(false);
    }
  };

  const getOrderProgress = () => {
    if (!orderLines.length) return 0;
    const total = orderLines.reduce((s, l) => s + l.quantity_units, 0);
    const fulfilled = orderLines.reduce((s, l) => s + l.quantity_fulfilled_units, 0);
    return Math.round((fulfilled / total) * 100);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Batch-Level Order Picking</h1>
        <p className="text-sm text-slate-500">Select batches from FEFO suggestions and enter quantities to dispatch.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Orders Selection Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Orders in Queue</h2>
          {orders.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-500 text-sm">
              No orders ready to pick.
            </div>
          ) : (
            orders.map(o => {
              const active = selectedOrder?.id === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => selectOrder(o)}
                  className={`w-full text-left rounded-xl p-4 transition-all border ${
                    active
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md border-transparent'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm tracking-tight">{o.order_number}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {o.status}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 truncate ${active ? 'text-white/80' : 'text-slate-500'}`}>
                    {(o as any).customer?.name}
                  </p>
                  <p className={`text-[10px] mt-2 font-mono ${active ? 'text-white/60' : 'text-slate-400'}`}>
                    Ordered: {o.order_date}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* Picking Area */}
        <div className="lg:col-span-2 space-y-6">
          {selectedOrder ? (
            <>
              {/* Fulfillment Entry Panel */}
              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Picking: {selectedOrder.order_number}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{(selectedOrder as any).customer?.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-medium">
                      Progress: {getOrderProgress()}%
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-600">
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                {/* Fulfillment Entries */}
                {fulfillEntries.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Dispatch Entries
                    </h3>
                    {fulfillEntries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <Package className="h-4 w-4 text-emerald-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-slate-700">{entry.product_name}</span>
                          <span className="text-[10px] text-slate-400 ml-2 font-mono">{entry.batch_code}</span>
                        </div>
                        <input
                          type="number"
                          min={1}
                          value={entry.quantity_units}
                          onChange={e => updateEntryQty(i, parseInt(e.target.value) || 1)}
                          className="w-20 text-center rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"
                        />
                        <button onClick={() => removeEntry(i)} className="text-slate-400 hover:text-red-500">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={handleConfirmFulfill}
                      disabled={submittingPick}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      {submittingPick ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ArrowRight className="h-5 w-5" />
                      )}
                      {submittingPick ? 'Dispatching...' : `Confirm Dispatch (${fulfillEntries.length} entries)`}
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <div className="rounded-xl bg-red-50 p-4 text-xs text-red-700 font-medium">
                    ❌ {errorMsg}
                  </div>
                )}

                {successMsg && (
                  <div className="rounded-xl bg-green-50 p-4 text-xs text-green-700 font-medium">
                    ✅ {successMsg}
                  </div>
                )}
              </div>

              {/* FEFO Suggestions Matrix */}
              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">FEFO Guided Picking Reference</h3>
                
                <div className="space-y-6">
                  {pickSuggestions.map((sug, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-slate-700">{sug.product_name} ({sug.product_code})</span>
                        <span className="text-xs font-medium text-slate-500">Needed Units: <span className="font-bold text-slate-800">{sug.needed_units}</span></span>
                      </div>
                      
                      {sug.batches.length === 0 ? (
                        <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl font-medium">
                          ⚠️ No valid in-stock batches found for this product.
                        </p>
                      ) : (
                        <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                          {sug.batches.map((b, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <div className="flex items-center gap-1.5 font-mono text-slate-700">
                                <CornerDownRight className="h-3.5 w-3.5 text-slate-400" />
                                <span className="font-bold text-emerald-600">{b.batch_code}</span>
                                <span className="text-[10px] text-slate-400">(Exp: {b.expiry_date})</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-[10px] text-slate-400">Stock: <span className="font-semibold text-slate-700">{b.quantity_remaining}</span></span>
                                <button
                                  onClick={() => addEntry(sug, idx)}
                                  className="rounded bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 transition text-[10px]"
                                >
                                  Pull {b.suggested_pull}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 text-center text-slate-400 shadow-md ring-1 ring-slate-100 h-96">
              <ClipboardList className="h-12 w-12 text-slate-300 mb-3" />
              <h3 className="font-semibold text-slate-700">No Order Selected</h3>
              <p className="text-xs max-w-xs mt-1">Select an order from the list on the left to start FEFO picking.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
