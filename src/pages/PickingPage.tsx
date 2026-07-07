import { useState, useEffect, useRef } from 'react';
import { supabase, type Order, type OrderLine } from '../api/client';
import { Loader2, ClipboardList, Scan, CheckCircle2, ChevronRight, Barcode, Play, CornerDownRight } from 'lucide-react';

type PickSuggestion = {
  product_name: string;
  product_code: string;
  needed_units: number;
  batches: Array<{
    batch_code: string;
    expiry_date: string;
    quantity_remaining: number;
    suggested_pull: number;
  }>;
};

export function PickingPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [pickSuggestions, setPickSuggestions] = useState<PickSuggestion[]>([]);
  
  // Scanned input state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [pickQty, setPickQty] = useState<string>('');
  const [submittingPick, setSubmittingPick] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

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
    setBarcodeInput('');
    setPickQty('');
    
    try {
      // Fetch lines
      const { data: lines } = await supabase.from('order_lines')
        .select('*, product:products(*)')
        .eq('order_id', order.id);
      
      if (lines) {
        setOrderLines(lines as OrderLine[]);
      }

      // Fetch pick suggestions
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch(`http://localhost:3001/api/orders/${order.id}/pick-suggestion`, {
        headers: {
          'Authorization': `Bearer ${stored.token}`
        }
      });
      const result = await response.json();
      if (result.data) {
        setPickSuggestions(result.data as PickSuggestion[]);
      }
    } catch (err) {
      console.error(err);
    }

    // Auto focus barcode input
    setTimeout(() => {
      focusBarcode();
    }, 100);
  };

  const focusBarcode = () => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    // Find suggested qty for this batch code if any
    let matchedQty = 0;
    for (const sug of pickSuggestions) {
      const match = sug.batches.find(b => b.batch_code === barcodeInput.trim());
      if (match) {
        matchedQty = match.suggested_pull;
        break;
      }
    }

    setPickQty(matchedQty > 0 ? String(matchedQty) : '1');
    
    // Focus quantity input next
    setTimeout(() => {
      if (qtyInputRef.current) {
        qtyInputRef.current.focus();
        qtyInputRef.current.select();
      }
    }, 50);
  };

  const handleFulfillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !barcodeInput.trim()) return;

    const qty = parseInt(pickQty);
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('Please enter a valid quantity.');
      return;
    }

    setSubmittingPick(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch(`http://localhost:3001/api/orders/${selectedOrder.id}/fulfill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.token}`
        },
        body: JSON.stringify({
          batch_code: barcodeInput.trim(),
          quantity: qty
        })
      });

      const result = await response.json();
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        setSuccessMsg(`Fulfillment scan successful: Pulled ${qty} units from Batch ${barcodeInput.trim()}.`);
        
        // Reload order state
        await selectOrder(selectedOrder);
        // Refresh master orders list
        await fetchOrders();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Fulfillment request failed.');
    } finally {
      setSubmittingPick(false);
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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">FEFO Guided Order Picking</h1>
        <p className="text-sm text-slate-500">Pick stock using FEFO principles to avoid batch expiration waste.</p>
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
                      ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md border-transparent'
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
              {/* Scan Barcode Section */}
              <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Picking Workstation: {selectedOrder.order_number}</h2>
                  <span className="text-xs text-slate-400">Scan batch code to log withdraws</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Step 1: Scan Barcode */}
                  <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Step 1: Scan Batch Barcode</label>
                    <div className="relative">
                      <Barcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        value={barcodeInput}
                        onChange={e => setBarcodeInput(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm font-semibold transition focus:border-brand-500 focus:outline-none"
                        placeholder="Scan or type batch code..."
                      />
                    </div>
                  </form>

                  {/* Step 2: Confirm Qty */}
                  <form onSubmit={handleFulfillSubmit} className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Step 2: Confirm Pull Count</label>
                    <div className="flex gap-2">
                      <input
                        ref={qtyInputRef}
                        type="number"
                        value={pickQty}
                        onChange={e => setPickQty(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-800 transition focus:border-brand-500 focus:outline-none"
                        placeholder="Units to pull"
                      />
                      <button
                        type="submit"
                        disabled={submittingPick || !barcodeInput.trim()}
                        className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
                      >
                        {submittingPick ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Withdraw'}
                      </button>
                    </div>
                  </form>
                </div>

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
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-3">FEFO Guided Pull Matrix</h3>
                
                <div className="space-y-6">
                  {pickSuggestions.map((sug, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-slate-700">{sug.product_name} ({sug.product_code})</span>
                        <span className="text-xs font-medium text-slate-500">Needed Units: <span className="font-bold text-slate-800">{sug.needed_units}</span></span>
                      </div>
                      
                      {sug.batches.length === 0 ? (
                        <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl font-medium">
                          ⚠️ No valid in-stock batches found for this product. Fulfilling order is blocked.
                        </p>
                      ) : (
                        <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                          {sug.batches.map((b, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <div className="flex items-center gap-1.5 font-mono text-slate-700">
                                <CornerDownRight className="h-3.5 w-3.5 text-slate-400" />
                                <span className="font-bold text-brand-600">{b.batch_code}</span>
                                <span className="text-[10px] text-slate-400">(Exp: {b.expiry_date})</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-[10px] text-slate-400">Stock: <span className="font-semibold text-slate-700">{b.quantity_remaining}</span></span>
                                <span className="rounded bg-brand-50 px-2 py-0.5 font-bold text-brand-700">Pull {b.suggested_pull}</span>
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
