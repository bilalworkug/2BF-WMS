import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type CameraScannerProps = {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: string) => void;
};

export function CameraScanner({ onScanSuccess, onScanFailure }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isInitializingRef = useRef(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    
    // Prevent double initialization in StrictMode
    if (isInitializingRef.current || scannerRef.current) return;
    isInitializingRef.current = true;

    const containerId = 'html5qr-code-full-region';
    const html5Qrcode = new Html5Qrcode(containerId);
    scannerRef.current = html5Qrcode;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    };

    html5Qrcode
      .start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (mounted) onScanSuccess(decodedText);
        },
        (error) => {
          if (mounted && onScanFailure) onScanFailure(error);
        }
      )
      .then(() => {
        if (mounted) setHasPermission(true);
      })
      .catch((err) => {
        console.warn('Camera start error:', err);
        if (mounted) setHasPermission(false);
      });

    return () => {
      mounted = false;
      if (html5Qrcode.isScanning) {
        html5Qrcode
          .stop()
          .then(() => html5Qrcode.clear())
          .catch((err) => console.warn('Failed to clear scanner', err));
      } else {
        html5Qrcode.clear();
      }
    };
  }, [onScanSuccess, onScanFailure]);

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-black/5 p-4">
      {hasPermission === false && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
          Camera permission denied or camera not found. Please allow camera access in your browser.
        </div>
      )}
      <div id="html5qr-code-full-region" className="w-full"></div>
    </div>
  );
}
