import { useEffect, useState } from 'react';
import { supabase } from '../api/client';
import { LoadingState } from '../components/ui';
import { useAuth, type PageKey } from '../api/auth';
import {
  ClipboardList,
  Package,
  AlertTriangle,
  ScanLine,
  CheckCircle2,
  Loader2,
  BarChart3,
  Lock,
  Activity,
} from 'lucide-react';

type WMSStats = {
  totalProducts: number;
  totalBatches: number;
  batchesInStock: number;
  batchesPendingReceipt: number;
  batchesOnHold: number;
  batchesExpiringSoon: number;
  pendingDiscrepancies: number;
  pendingOrders: number;
  pendingDamageReports: number;
};

type RecentAudit = {
  id: string;
  action_type: string;
  entity_type: string | null;
  details: string | null;
  created_at: string;
};

type Props = {
  onNavigate: (page: PageKey) => void;
};

export function DashboardPage({ onNavigate }: Props) {
  const { user, role, permissions } = useAuth();
  const [stats, setStats] = useState<WMSStats | null>(null);
  const [recentAudit, setRecentAudit] = useState<RecentAudit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [
        productsRes,
        allBatchesRes,
        inStockRes,
        pendingReceiptRes,
        onHoldRes,
        expiringSoonRes,
        discrepanciesRes,
        ordersRes,
        damageRes,
        auditRes,
      ] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('batches').select('id', { count: 'exact', head: true }),
        supabase.from('batches').select('id', { count: 'exact', head: true }).eq('status', 'in_stock'),
        supabase.from('batches').select('id', { count: 'exact', head: true }).eq('status', 'produced_pending_receipt'),
        supabase.from('batches').select('id', { count: 'exact', head: true }).eq('status', 'on_hold'),
        supabase.from('batches').select('id', { count: 'exact', head: true }).eq('status', 'in_stock').lte('expiry_date', soonDate).gte('expiry_date', today),
        supabase.from('receipt_discrepancies').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('damage_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(8),
      ]);

      setStats({
        totalProducts: (productsRes as any).count ?? 0,
        totalBatches: (allBatchesRes as any).count ?? 0,
        batchesInStock: (inStockRes as any).count ?? 0,
        batchesPendingReceipt: (pendingReceiptRes as any).count ?? 0,
        batchesOnHold: (onHoldRes as any).count ?? 0,
        batchesExpiringSoon: (expiringSoonRes as any).count ?? 0,
        pendingDiscrepancies: (discrepanciesRes as any).count ?? 0,
        pendingOrders: (ordersRes as any).count ?? 0,
        pendingDamageReports: (damageRes as any).count ?? 0,
      });

      if (auditRes.data) {
        setRecentAudit(auditRes.data as RecentAudit[]);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingState message="Loading WMS dashboard..." />
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Welcome back, {user?.name?.split(' ')[0] || 'Operator'} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            2BFC Warehouse Management System &bull; {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-4 py-1.5 text-xs font-bold text-brand-700 uppercase tracking-wider ring-1 ring-brand-100">
          {role?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Products"
          value={s.totalProducts}
          icon={<Package className="h-5 w-5" />}
          color="blue"
          onClick={permissions.canEditProducts ? () => onNavigate('products') : undefined}
        />
        <StatCard
          title="Batches in Stock"
          value={s.batchesInStock}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="green"
          onClick={() => onNavigate('batches')}
        />
        <StatCard
          title="Pending Receipt"
          value={s.batchesPendingReceipt}
          icon={<ScanLine className="h-5 w-5" />}
          color="amber"
          onClick={permissions.canReceiveStock ? () => onNavigate('receiving') : undefined}
        />
        <StatCard
          title="Orders Pending"
          value={s.pendingOrders}
          icon={<ClipboardList className="h-5 w-5" />}
          color="purple"
          onClick={permissions.canPickOrders ? () => onNavigate('picking') : undefined}
        />
      </div>

      {/* Alert row */}
      {(s.batchesOnHold > 0 || s.pendingDiscrepancies > 0 || s.batchesExpiringSoon > 0 || s.pendingDamageReports > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {s.batchesOnHold > 0 && (
            <AlertBanner
              label={`${s.batchesOnHold} Batches on QA Hold`}
              icon={<Lock className="h-4 w-4" />}
              color="red"
              onClick={permissions.canManageHolds ? () => onNavigate('holds') : undefined}
            />
          )}
          {s.batchesExpiringSoon > 0 && (
            <AlertBanner
              label={`${s.batchesExpiringSoon} Batches Expiring < 30 Days`}
              icon={<AlertTriangle className="h-4 w-4" />}
              color="amber"
              onClick={() => onNavigate('batches')}
            />
          )}
          {s.pendingDiscrepancies > 0 && (
            <AlertBanner
              label={`${s.pendingDiscrepancies} Discrepancies Unresolved`}
              icon={<Activity className="h-4 w-4" />}
              color="orange"
              onClick={permissions.canResolveDiscrepancies ? () => onNavigate('discrepancies') : undefined}
            />
          )}
          {s.pendingDamageReports > 0 && (
            <AlertBanner
              label={`${s.pendingDamageReports} Damage Reports Pending`}
              icon={<AlertTriangle className="h-4 w-4" />}
              color="red"
              onClick={permissions.canManageDamages ? () => onNavigate('damage') : undefined}
            />
          )}
        </div>
      )}

      {/* Quick Actions + Live Audit Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="lg:col-span-1 rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Quick Actions</h2>
          {permissions.canReceiveStock && (
            <QuickAction label="Scan & Receive Stock" icon={<ScanLine className="h-4.5 w-4.5" />} onClick={() => onNavigate('receiving')} />
          )}
          {permissions.canPickOrders && (
            <QuickAction label="Start Order Picking" icon={<ClipboardList className="h-4.5 w-4.5" />} onClick={() => onNavigate('picking')} />
          )}
          {permissions.canResolveDiscrepancies && s.pendingDiscrepancies > 0 && (
            <QuickAction label={`Review Discrepancies (${s.pendingDiscrepancies})`} icon={<Activity className="h-4.5 w-4.5" />} onClick={() => onNavigate('discrepancies')} urgent />
          )}
          {permissions.canManageHolds && s.batchesOnHold > 0 && (
            <QuickAction label={`QA Holds Pending (${s.batchesOnHold})`} icon={<Lock className="h-4.5 w-4.5" />} onClick={() => onNavigate('holds')} urgent />
          )}
          {permissions.pages.includes('reports') && (
            <QuickAction label="View Reports Panel" icon={<BarChart3 className="h-4.5 w-4.5" />} onClick={() => onNavigate('reports')} />
          )}
        </div>

        {/* Live Audit Feed */}
        <div className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Live System Activity</h2>
          <div className="space-y-3">
            {recentAudit.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No activity recorded yet.</p>
            ) : (
              recentAudit.map(a => (
                <div key={a.id} className="flex items-start gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-brand-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 capitalize">
                      {a.action_type.replace(/_/g, ' ')}
                      {a.entity_type && (
                        <span className="ml-1.5 text-[10px] font-bold text-slate-400 normal-case">
                          [{a.entity_type}]
                        </span>
                      )}
                    </p>
                    {a.details && (
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{
                        (() => {
                          try { return JSON.stringify(JSON.parse(a.details)); } catch { return a.details; }
                        })()
                      }</p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
                    {new Date(a.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function StatCard({
  title, value, icon, color, onClick
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'amber' | 'purple';
  onClick?: () => void;
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-100 space-y-4 ${onClick ? 'cursor-pointer hover:ring-brand-300 hover:shadow-lg transition-all' : ''}`}
    >
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-slate-900">{value.toLocaleString()}</p>
        <p className="text-xs text-slate-500 font-medium mt-0.5">{title}</p>
      </div>
    </div>
  );
}

function AlertBanner({
  label, icon, color, onClick
}: {
  label: string;
  icon: React.ReactNode;
  color: 'red' | 'amber' | 'orange';
  onClick?: () => void;
}) {
  const colors = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-3 flex items-center gap-2.5 text-xs font-semibold ${colors[color]} ${onClick ? 'cursor-pointer hover:shadow-sm transition-all' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function QuickAction({
  label, icon, onClick, urgent
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  urgent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-left transition-all ${
        urgent
          ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
          : 'bg-slate-50 text-slate-700 hover:bg-brand-50 hover:text-brand-700'
      }`}
    >
      <span className={urgent ? 'text-red-500' : 'text-brand-500'}>{icon}</span>
      {label}
    </button>
  );
}
