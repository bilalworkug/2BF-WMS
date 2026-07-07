import { type ReactNode } from 'react';
import { useAuth, type PageKey } from '../../api/auth';
import {
  LayoutDashboard,
  Users,
  Package,
  ClipboardList,
  BarChart3,
  ScanLine,
  LogOut,
  Menu,
  X,
  UserCog,
  Warehouse,
  ListOrdered,
  Truck,
  ClipboardCheck,
  Lock,
  AlertTriangle,
  History,
} from 'lucide-react';
import { useState } from 'react';

type NavItem = {
  key: PageKey;
  label: string;
  icon: ReactNode;
};

const allNavItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: 'customers', label: 'Customers', icon: <Users className="h-5 w-5" /> },
  { key: 'products', label: 'Product Catalog', icon: <Package className="h-5 w-5" /> },
  { key: 'batches', label: 'Log Production', icon: <ClipboardList className="h-5 w-5" /> },
  { key: 'receiving', label: 'Receive Stock', icon: <ScanLine className="h-5 w-5" /> },
  { key: 'discrepancies', label: 'Discrepancies', icon: <ClipboardCheck className="h-5 w-5" /> },
  { key: 'picking', label: 'Order Picking', icon: <ListOrdered className="h-5 w-5" /> },
  { key: 'damage', label: 'Report Damage', icon: <AlertTriangle className="h-5 w-5" /> },
  { key: 'holds', label: 'Quality Holds', icon: <Lock className="h-5 w-5" /> },
  { key: 'reports', label: 'Reports Panel', icon: <BarChart3 className="h-5 w-5" /> },
  { key: 'users', label: 'User Accounts', icon: <UserCog className="h-5 w-5" /> },
  { key: 'audit_log', label: 'Audit Trail', icon: <History className="h-5 w-5" /> },
];

type AppShellProps = {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
};

export function AppShell({ current, onNavigate, children }: AppShellProps) {
  const { user, role, permissions, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = allNavItems.filter((item) => permissions.pages.includes(item.key));

  const handleNav = (page: PageKey) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const roleBadgeColor: Record<string, string> = {
    super_admin: 'bg-brand-100 text-brand-700',
    report_viewer: 'bg-slate-100 text-slate-600',
    production: 'bg-blue-100 text-blue-700',
    warehouse_receiving: 'bg-cyan-100 text-cyan-700',
    warehouse_withdrawal: 'bg-indigo-100 text-indigo-700',
    sales: 'bg-green-100 text-green-700',
    stock_manager: 'bg-amber-100 text-amber-700',
    qa_officer: 'bg-red-100 text-red-700',
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 px-6 py-6">
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-white to-slate-50 shadow-sm ring-1 ring-slate-100">
          <img src="/logo.png" alt="2BF Logo" className="h-9 w-9 object-contain" />
        </div>
        <div>
          <h1 className="bg-gradient-to-r from-brand-700 to-indigo-700 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">2BFC WMS</h1>
          <p className="text-xs font-medium text-slate-500">Two Brothers Food Complex</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-4">
        {navItems.map((item) => {
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                active
                  ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className={active ? 'text-white' : 'text-slate-400'}>{item.icon}</div>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-slate-100 bg-slate-50/50 p-4">
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-100 text-sm font-bold text-slate-600 shadow-inner">
            {(user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-700">{user?.email}</p>
            <span className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleBadgeColor[role] ?? 'bg-slate-100 text-slate-600'}`}>
              {role?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white md:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="2BF Logo" className="h-6 w-6 object-contain" />
            <span className="font-bold text-slate-900">2BFC WMS</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
