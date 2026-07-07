import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, type Batch } from '../api/client';
import { Loader2, Scan, CheckCircle, AlertTriangle, RefreshCw, Barcode, Save, Camera, X } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Simple beep for scanner feedback
function playBeep(success = true) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (success) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // Ignore audio errors
  }
}

// Sub-component to isolate the Html5QrcodeScanner lifecycle
function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void, onClose: () => void }) {
  useEffect(() => {
    // In React 18 Strict Mode, useEffect runs twice. 
    // html5-qrcode doesn't handle double-render well, so we catch clear errors.
    const scanner = new Html5QrcodeScanner("reader", { 
      fps: 10, 
      qrbox: {width: 250, height: 100}, // wider for barcodes
      aspectRatio: 1.5,
    }, false);
    
    let lastScanTime = 0;
    scanner.render((text) => {
      // Debounce scans (1.5 seconds) to prevent scanning the same box 10 times instantly
      const now = Date.now();
      if (now - lastScanTime > 1500) {
        lastScanTime = now;
        onScan(text);
      }
    }, () => {
      // ignore frame errors (it errors continuously when no barcode is found)
    });

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 mt-4 animate-in fade-in zoom-in-95">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Camera className="h-4 w-4 text-brand-500" />
          Camera Active
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition bg-white border border-slate-200 p-1.5 rounded-lg shadow-sm">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div id="reader" className="w-full"></div>
    </div>
  );
}

export function ReceiveStock() {
  const [scanInput, setScanInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Focus reference to scanner input
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Keep a ref of activeBatch so the camera callback doesn't have stale closures if it was memoized differently,
  // though useCallback with activeBatch in deps works too.
  const activeBatchRef = useRef(activeBatch);
  useEffect(() => {
    activeBatchRef.current = activeBatch;
  }, [activeBatch]);

  useEffect(() => {
    if (!cameraOpen) focusScanner();
    fetchRecentAudits();
  }, [cameraOpen]);

  const focusScanner = () => {
    if (scanInputRef.current) {
      scanInputRef.current.focus();
    }
  };

  const fetchRecentAudits = async () => {
    try {
      const { data } = await supabase.from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) {
        setRecentAudits(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Central logic to process a barcode (from either manual input or camera)
  const processBarcode = useCallback(async (code: string) => {
    if (!code) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setScanInput(''); // Clear immediately so scanner is ready for next beep

    const currentBatch = activeBatchRef.current;

    // 1. If we already have an active batch, check if this scan matches
    if (currentBatch) {
      if (code === currentBatch.batch_code) {
        // Increment counter
        setScanCount(prev => prev + 1);
        playBeep(true);
      } else {
        // Scanned a different batch before submitting the current one
        playBeep(false);
        setErrorMsg(`You scanned batch ${code}, but you are currently counting ${currentBatch.batch_code}. Please submit your current count first.`);
      }
      if (!cameraOpen) focusScanner();
      return;
    }

    // 2. Fetch the batch for the first time
    setLoadingBatch(true);
    try {
      const { data, error } = await supabase.from('batches')
        .select('*, product:products(*)')
        .eq('batch_code', code)
        .maybeSingle();

      if (error || !data) {
        playBeep(false);
        setErrorMsg(`Batch ${code} not found in system.`);
      } else {
        const batch = data as Batch;
        if (batch.status !== 'produced_pending_receipt') {
          playBeep(false);
          setErrorMsg(`Batch ${batch.batch_code} has already been processed (Status: ${batch.status}).`);
        } else {
          // Valid batch found! Set as active and start count at 1
          playBeep(true);
          setActiveBatch(batch);
          setScanCount(1);
        }
      }
    } catch (err) {
      playBeep(false);
      setErrorMsg('Failed to search database.');
    } finally {
      setLoadingBatch(false);
      if (!cameraOpen) focusScanner();
    }
  }, [cameraOpen]);

  const handleScanForm = (e: React.FormEvent) => {
    e.preventDefault();
    processBarcode(scanInput.trim());
  };

  // Confirm receipt of quantity
  const handleConfirmReceipt = async () => {
    if (!activeBatch) return;

    if (scanCount <= 0) {
      setErrorMsg('Cannot submit an empty count.');
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
          actual_quantity: scanCount
        })
      });

      const result = await response.json();
      if (result.error) {
        playBeep(false);
        setErrorMsg(result.error.message);
      } else {
        playBeep(true);
        if (result.data.status === 'success') {
          setSuccessMsg(`Received Successfully: Batch ${activeBatch.batch_code} confirmed in stock with ${scanCount} units.`);
        } else {
          setSuccessMsg(`Flagged Discrepancy: Mismatch recorded for Batch ${activeBatch.batch_code}. Expected ${activeBatch.quantity_produced}, but counted ${scanCount}.`);
        }
        // Clear active batch
        setActiveBatch(null);
        setScanCount(0);
        setCameraOpen(false); // Close camera on successful submit
        fetchRecentAudits();
      }
    } catch (err: any) {
      playBeep(false);
      setErrorMsg(err.message || 'Verification request failed.');
    } finally {
      setSubmitting(false);
      focusScanner();
    }
  };

  const handleCancel = () => {
    setActiveBatch(null);
    setScanCount(0);
    setScanInput('');
    setErrorMsg(null);
    setSuccessMsg(null);
    focusScanner();
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Warehouse Goods Inbound</h1>
        <p className="text-sm text-slate-500">Scan barcodes continuously to receive, count, and log inventory batches.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Scanner Panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Scanner Input</h2>
                {!cameraOpen && (
                  <button 
                    onClick={() => setCameraOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition"
                  >
                    <Camera className="h-4 w-4" />
                    Open Camera
                  </button>
                )}
              </div>
              {activeBatch && (
                <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
                  Scanning active...
                </span>
              )}
            </div>
            
            {!cameraOpen ? (
              <form onSubmit={handleScanForm} className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-4 text-lg font-semibold transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm"
                    placeholder={activeBatch ? `Keep scanning boxes for ${activeBatch.batch_code}...` : "Scan first box barcode to start..."}
                    disabled={loadingBatch || submitting}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingBatch || submitting || !scanInput.trim()}
                  className="rounded-xl bg-slate-800 px-6 py-4 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
                >
                  {loadingBatch ? <Loader2 className="h-5 w-5 animate-spin" /> : <Scan className="h-5 w-5" />}
                </button>
              </form>
            ) : (
              <CameraScanner 
                onScan={processBarcode} 
                onClose={() => setCameraOpen(false)} 
              />
            )}

            {!cameraOpen && (
              <p className="mt-3 text-xs text-slate-400 text-center">
                Make sure this field is focused before using your hardware barcode scanner.
              </p>
            )}

            {errorMsg && (
              <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700 animate-in fade-in">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mt-4 flex gap-2 rounded-xl bg-green-50 p-4 text-sm text-green-700 font-medium animate-in fade-in">
                <CheckCircle className="h-5 w-5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {/* Counting Interface */}
          {activeBatch && (
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-brand-500 border-l-4 border-l-brand-500 animate-in fade-in zoom-in-95 duration-150 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Barcode className="h-32 w-32" />
              </div>
              
              <div className="relative">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="inline-flex rounded bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 mb-1">Counting Batch</span>
                    <h3 className="text-2xl font-bold text-slate-800">{activeBatch.batch_code}</h3>
                    <p className="text-sm text-slate-600 font-medium mt-1">{(activeBatch as any).product?.name}</p>
                  </div>
                  <div className="text-right bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-xs text-slate-500 block uppercase font-bold">Expected Total</span>
                    <span className="text-xl font-extrabold text-slate-400">{activeBatch.quantity_produced}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 mb-6">
                  <div className="text-center">
                    <span className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Scanned Boxes</span>
                    <span className="text-6xl font-black text-brand-600 tabular-nums tracking-tight">
                      {scanCount}
                    </span>
                  </div>
                </div>
                
                {scanCount !== activeBatch.quantity_produced && scanCount > 0 && (
                  <div className="mb-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 font-medium flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>Current count ({scanCount}) does not match expected quantity ({activeBatch.quantity_produced}). Submitting now will flag a discrepancy.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={submitting}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel Scan
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReceipt}
                    disabled={submitting || scanCount === 0}
                    className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white hover:bg-brand-700 transition disabled:opacity-50 shadow-md shadow-brand-500/20"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        Submit Count ({scanCount})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Real-time audit activity feed */}
        <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 h-fit sticky top-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Audit log</h2>
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
