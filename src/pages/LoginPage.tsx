import { useState } from 'react';
import { useAuth } from '../api/auth';
import { Loader2, Shield, Package, Users, ClipboardList } from 'lucide-react';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('admin@2bfc.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error);
  };

  const fillCredentials = (role: 'super_admin' | 'production' | 'receiving' | 'withdrawal') => {
    if (role === 'super_admin') {
      setEmail('admin@2bfc.local');
      setPassword('admin123');
    } else if (role === 'production') {
      setEmail('production@2bfc.local');
      setPassword('production123');
    } else if (role === 'receiving') {
      setEmail('receiving@2bfc.local');
      setPassword('receiving123');
    } else {
      setEmail('withdrawal@2bfc.local');
      setPassword('withdrawal123');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-amber-50 to-orange-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
            <img src="/logo.png" alt="2BF Logo" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">2BFC WMS</h1>
          <p className="mt-1 text-sm text-slate-600">Two Brothers Food Complex Warehouse Management</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/60">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Sign in to WMS Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="you@2bfc.local"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Role quick-fill */}
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium text-slate-500">Quick login as:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fillCredentials('super_admin')}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-3 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50"
              >
                <Shield className="h-5 w-5 text-amber-500" />
                Super Admin
              </button>
              <button
                onClick={() => fillCredentials('production')}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-3 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <ClipboardList className="h-5 w-5 text-blue-500" />
                Production
              </button>
              <button
                onClick={() => fillCredentials('receiving')}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-3 text-xs font-medium text-slate-600 transition hover:border-green-300 hover:bg-green-50"
              >
                <Package className="h-5 w-5 text-green-500" />
                Receiving Clerk
              </button>
              <button
                onClick={() => fillCredentials('withdrawal')}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-3 text-xs font-medium text-slate-600 transition hover:border-orange-300 hover:bg-orange-50"
              >
                <Users className="h-5 w-5 text-orange-500" />
                Withdrawal Clerk
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Demo credentials:</p>
            <p className="mt-0.5">Admin: admin@2bfc.local / admin123</p>
            <p>Production: production@2bfc.local / production123</p>
            <p>Receiving: receiving@2bfc.local / receiving123</p>
            <p>Withdrawal: withdrawal@2bfc.local / withdrawal123</p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          2BFC WMS &middot; Built for Two Brothers Food Complex
        </p>
      </div>
    </div>
  );
}
