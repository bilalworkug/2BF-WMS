import { useState, useEffect } from 'react';
import { supabase, type Product, type Batch } from '../api/client';
import { Loader2, Printer, AlertCircle, Plus, Calendar, ShieldAlert } from 'lucide-react';

export function LogProduction() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState<number>(0);
  const [prodDate, setProdDate] = useState(new Date().toISOString().split('T')[0]);
  const [overrideExpiry, setOverrideExpiry] = useState(false);
  const [expiryDateOverride, setExpiryDateOverride] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [calculatedExpiry, setCalculatedExpiry] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Simulated printer state
  const [printedLabel, setPrintedLabel] = useState<{ code: string; name: string; expiry: string } | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*');
      if (data) {
        setProducts(data.filter(p => p.is_active));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Recalculate default expiry
  useEffect(() => {
    if (selectedProduct && selectedProduct.shelf_life_days !== null) {
      const pDate = new Date(prodDate);
      const exp = new Date(pDate.getTime() + selectedProduct.shelf_life_days * 24 * 60 * 60 * 1000);
      setCalculatedExpiry(exp.toISOString().split('T')[0]);
    } else {
      setCalculatedExpiry('');
    }
  }, [selectedProductId, prodDate, selectedProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setPrintedLabel(null);

    if (!selectedProductId) {
      setErrorMsg('Please select a product.');
      return;
    }

    if (qty <= 0) {
      setErrorMsg('Quantity must be greater than 0.');
      return;
    }

    if (overrideExpiry) {
      if (!expiryDateOverride) {
        setErrorMsg('Please choose an overridden expiry date.');
        return;
      }
      if (!overrideReason || overrideReason.trim().length < 5) {
        setErrorMsg('Please explain why you are overriding the shelf life (min 5 characters).');
        return;
      }
    }

    setSubmitting(true);
    try {
      const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
      const response = await fetch('http://localhost:3001/api/production/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.token}`
        },
        body: JSON.stringify({
          product_id: selectedProductId,
          quantity_produced: qty,
          production_date: prodDate,
          expiry_override: overrideExpiry ? expiryDateOverride : undefined,
          override_reason: overrideExpiry ? overrideReason : undefined
        })
      });

      const result = await response.json();
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        const newBatch = result.data as Batch;
        setSuccessMsg(`Batch ${newBatch.batch_code} successfully logged in system!`);
        
        // Mock print label to Zebra scanner
        setPrintedLabel({
          code: newBatch.batch_code,
          name: selectedProduct?.name || '',
          expiry: newBatch.expiry_date
        });

        // Reset
        setQty(0);
        setOverrideExpiry(false);
        setExpiryDateOverride('');
        setOverrideReason('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Server connection failed.');
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
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Log Production Batch</h1>
        <p className="text-sm text-slate-500">Record fresh production runs and generate warehouse-receiving barcode labels.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Input Form */}
        <div className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Select Product</label>
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none"
              >
                <option value="">-- Choose WMS Product --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            {selectedProduct && (selectedProduct.units_per_box === null || selectedProduct.shelf_life_days === null) && (
              <div className="flex gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Missing Shelf-Life Configuration</p>
                  <p className="text-xs mt-0.5">Please contact your Stock Manager to set shelf-life days and box sizing before logging runs.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Quantity (Units)</label>
                <input
                  type="number"
                  value={qty || ''}
                  onChange={e => setQty(parseInt(e.target.value) || 0)}
                  disabled={!selectedProduct || selectedProduct.shelf_life_days === null}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none"
                  placeholder="e.g. 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Production Date</label>
                <input
                  type="date"
                  value={prodDate}
                  onChange={e => setProdDate(e.target.value)}
                  disabled={!selectedProduct || selectedProduct.shelf_life_days === null}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {selectedProduct && selectedProduct.shelf_life_days !== null && (
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium">Standard Expiry Date:</span>
                  <span className="font-bold text-slate-800">{calculatedExpiry}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Automatically calculated based on {selectedProduct.shelf_life_days}-day shelf-life.</p>
              </div>
            )}

            {/* Expiry Override Option */}
            {selectedProduct && selectedProduct.shelf_life_days !== null && (
              <div className="border-t border-slate-100 pt-4 space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideExpiry}
                    onChange={e => setOverrideExpiry(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">Override Calculated Expiry Date</span>
                </label>

                {overrideExpiry && (
                  <div className="space-y-3 pl-6 border-l-2 border-brand-500">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">New Expiry Date</label>
                      <input
                        type="date"
                        value={expiryDateOverride}
                        onChange={e => setExpiryDateOverride(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Reason for Override</label>
                      <textarea
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm transition focus:border-brand-500 focus:outline-none"
                        rows={2}
                        placeholder="Explain why standard shelf life doesn't apply (minimum 5 characters)..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700 font-medium">
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedProduct || selectedProduct.shelf_life_days === null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Log Production Batch
            </button>
          </form>
        </div>

        {/* Barcode / Print Simulation Preview */}
        <div className="rounded-2xl bg-slate-900 text-white p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 text-brand-400">
              <Printer className="h-5 w-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Zebra Printer Preview</h2>
            </div>
            
            {printedLabel ? (
              <div className="rounded-lg bg-white text-black p-4 font-mono border-2 border-black space-y-3">
                <div className="text-center font-bold border-b border-black pb-1">
                  2BFC WMS LABEL
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 leading-none">SKU / ITEM</p>
                  <p className="font-bold text-xs truncate">{printedLabel.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>
                    <span className="text-[8px] block text-slate-500">BATCH CODE</span>
                    <span className="font-bold">{printedLabel.code}</span>
                  </div>
                  <div>
                    <span className="text-[8px] block text-slate-500">EXPIRY DATE</span>
                    <span className="font-bold">{printedLabel.expiry}</span>
                  </div>
                </div>
                {/* Visual barcode mockup */}
                <div className="bg-black h-12 flex items-center justify-center gap-0.5 px-2">
                  <div className="w-1 bg-white h-full" />
                  <div className="w-0.5 bg-white h-full" />
                  <div className="w-2 bg-white h-full" />
                  <div className="w-1 bg-white h-full" />
                  <div className="w-0.5 bg-white h-full" />
                  <div className="w-1 bg-white h-full" />
                  <div className="w-3 bg-white h-full" />
                  <div className="w-0.5 bg-white h-full" />
                  <div className="w-1 bg-white h-full" />
                </div>
                <p className="text-[9px] text-center tracking-widest">{printedLabel.code}</p>
              </div>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500 text-center p-4">
                <Printer className="h-8 w-8 mb-2" />
                <p className="text-xs">No labels printed yet.</p>
                <p className="text-[10px] mt-1">Submit the production log form on the left to print a scanning label.</p>
              </div>
            )}
          </div>
          
          <div className="text-[11px] text-slate-400 mt-4 border-t border-slate-800 pt-3">
            Labels generated here are standard Code 128 formats printable on standard desktop roll printers.
          </div>
        </div>
      </div>
    </div>
  );
}
