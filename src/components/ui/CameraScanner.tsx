import { useEffect } from 'react';
import { Camera, X } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void, onClose: () => void }) {
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
