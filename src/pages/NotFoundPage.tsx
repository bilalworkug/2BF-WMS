import { Home, ArrowLeft, AlertTriangle } from 'lucide-react';

type Props = {
  onHome: () => void;
  onBack: () => void;
};

export function NotFoundPage({ onHome, onBack }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff7ed_0,_#f8fafc_45%,_#e2e8f0_100%)] px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-2xl shadow-slate-200/60 backdrop-blur">
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">404</p>
                <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-8 sm:px-8 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-sm leading-6 text-slate-600">
                The address you opened does not match a valid screen in this app.
                It may have been mistyped, removed, or never existed in the first place.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={onHome}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <Home className="h-4 w-4" />
                  Go home
                </button>
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Go back
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Quick links</p>
              <div className="mt-4 space-y-2 text-sm">
                <button onClick={onHome} className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-white">
                  Dashboard
                </button>
                <button onClick={onBack} className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-white">
                  Return to previous page
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
