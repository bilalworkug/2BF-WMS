import { useEffect, useState, useCallback } from 'react';
import { useAuth, type UserRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../api/auth';
import { LoadingState, ErrorState, Badge, Spinner } from '../components/ui';
import { Modal, ConfirmDialog } from '../components/Modal';
import { UserCog, Plus, Trash2, Shield, Package, Users as UsersIcon } from 'lucide-react';

type AppUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  created_at: string;
};

const roleIcons: Record<UserRole, React.ReactNode> = {
  super_admin: <Shield className="h-4 w-4" />,
  report_viewer: <UsersIcon className="h-4 w-4" />,
  production: <Package className="h-4 w-4" />,
  warehouse_receiving: <Package className="h-4 w-4" />,
  warehouse_withdrawal: <Package className="h-4 w-4" />,
  sales: <UsersIcon className="h-4 w-4" />,
  stock_manager: <Package className="h-4 w-4" />,
  qa_officer: <Shield className="h-4 w-4" />,
};

const roleBadgeColors: Record<UserRole, 'amber' | 'blue' | 'green'> = {
  super_admin: 'amber',
  report_viewer: 'blue',
  production: 'blue',
  warehouse_receiving: 'blue',
  warehouse_withdrawal: 'blue',
  sales: 'green',
  stock_manager: 'amber',
  qa_officer: 'amber',
};

const API_URL = 'http://localhost:3001';

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('crm_auth');
    return raw ? JSON.parse(raw).token : null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'report_viewer' as UserRole });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        headers: authHeaders()
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error.message);
      } else {
        setUsers(json.data as AppUser[]);
      }
    } catch (err) {
      setError('Connection to backend failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(newUser)
      });
      const json = await res.json();

      if (json.error) {
        setFormError(json.error.message);
      } else {
        setAddOpen(false);
        setNewUser({ email: '', password: '', name: '', role: 'report_viewer' as UserRole });
        load();
      }
    } catch (err) {
      setFormError('Connection to server failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`${API_URL}/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const json = await res.json();
      if (json.error) {
        alert(json.error.message);
      } else {
        load();
      }
    } catch {
      alert('Failed to connect to server');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <UserCog className="h-6 w-6 text-brand-500" />
            User Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">Manage who can access the WMS and their permissions matrix</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Role legend */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
          <div key={r} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600`}>
                {roleIcons[r]}
              </div>
              <Badge color={roleBadgeColors[r]}>{ROLE_LABELS[r]}</Badge>
            </div>
            <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <LoadingState message="Loading users..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-semibold">{u.name || 'No Name'}</td>
                  <td className="px-6 py-4">{u.email}</td>
                  <td className="px-6 py-4">
                    <Badge color={roleBadgeColors[u.role]}>{ROLE_LABELS[u.role] || u.role}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {u.id === currentUser?.id ? (
                      <span className="text-xs text-slate-400">You</span>
                    ) : (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add User" size="md">
        <form onSubmit={handleAddUser} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{formError}</div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {Object.keys(ROLE_LABELS).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r as UserRole]}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <Spinner className="h-4 w-4 animate-spin" />}
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.email}"? They will lose access immediately.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
