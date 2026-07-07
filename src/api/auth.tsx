import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type UserRole = 'super_admin' | 'report_viewer' | 'production' | 'warehouse_receiving' | 'warehouse_withdrawal' | 'sales' | 'stock_manager' | 'qa_officer';

export type PageKey = 'dashboard' | 'customers' | 'products' | 'batches' | 'receiving' | 'discrepancies' | 'picking' | 'damage' | 'holds' | 'reports' | 'users' | 'audit_log';

export type Permissions = {
  pages: PageKey[];
  canDelete: boolean;
  canManageUsers: boolean;
  canChangeOrderStatus: boolean;
  canEditProducts: boolean;
  canEditCustomers: boolean;
  canReceiveStock: boolean;
  canCreateOrders: boolean;
  canPickOrders: boolean;
  canManageHolds: boolean;
  canManageDamages: boolean;
  canResolveDiscrepancies: boolean;
};

const ROLE_PERMISSIONS: Record<UserRole, Permissions> = {
  super_admin: {
    pages: ['dashboard', 'customers', 'products', 'batches', 'receiving', 'discrepancies', 'picking', 'damage', 'holds', 'reports', 'users', 'audit_log'],
    canDelete: true,
    canManageUsers: true,
    canChangeOrderStatus: true,
    canEditProducts: true,
    canEditCustomers: true,
    canReceiveStock: true,
    canCreateOrders: true,
    canPickOrders: true,
    canManageHolds: true,
    canManageDamages: true,
    canResolveDiscrepancies: true,
  },
  report_viewer: {
    pages: ['dashboard', 'products', 'batches', 'picking', 'reports'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: false,
    canEditProducts: false,
    canEditCustomers: false,
    canReceiveStock: false,
    canCreateOrders: false,
    canPickOrders: false,
    canManageHolds: false,
    canManageDamages: false,
    canResolveDiscrepancies: false,
  },
  production: {
    pages: ['dashboard', 'products', 'batches'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: false,
    canEditProducts: false,
    canEditCustomers: false,
    canReceiveStock: false,
    canCreateOrders: false,
    canPickOrders: false,
    canManageHolds: false,
    canManageDamages: false,
    canResolveDiscrepancies: false,
  },
  warehouse_receiving: {
    pages: ['dashboard', 'products', 'batches', 'receiving', 'discrepancies'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: false,
    canEditProducts: false,
    canEditCustomers: false,
    canReceiveStock: true,
    canCreateOrders: false,
    canPickOrders: false,
    canManageHolds: false,
    canManageDamages: false,
    canResolveDiscrepancies: false,
  },
  warehouse_withdrawal: {
    pages: ['dashboard', 'products', 'batches', 'picking', 'damage'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: false,
    canEditProducts: false,
    canEditCustomers: false,
    canReceiveStock: false,
    canCreateOrders: false,
    canPickOrders: true,
    canManageHolds: false,
    canManageDamages: true,
    canResolveDiscrepancies: false,
  },
  sales: {
    pages: ['dashboard', 'customers'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: true,
    canEditProducts: false,
    canEditCustomers: true,
    canReceiveStock: false,
    canCreateOrders: true,
    canPickOrders: false,
    canManageHolds: false,
    canManageDamages: false,
    canResolveDiscrepancies: false,
  },
  stock_manager: {
    pages: ['dashboard', 'products', 'batches', 'discrepancies', 'damage', 'holds', 'reports'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: true,
    canEditProducts: true,
    canEditCustomers: false,
    canReceiveStock: false,
    canCreateOrders: false,
    canPickOrders: false,
    canManageHolds: false,
    canManageDamages: true,
    canResolveDiscrepancies: true,
  },
  qa_officer: {
    pages: ['dashboard', 'products', 'batches', 'damage', 'holds', 'reports'],
    canDelete: false,
    canManageUsers: false,
    canChangeOrderStatus: false,
    canEditProducts: false,
    canEditCustomers: false,
    canReceiveStock: false,
    canCreateOrders: false,
    canPickOrders: false,
    canManageHolds: true,
    canManageDamages: true,
    canResolveDiscrepancies: false,
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  report_viewer: 'Report Viewer',
  production: 'Production Operator',
  warehouse_receiving: 'Receiving Clerk',
  warehouse_withdrawal: 'Withdrawal Clerk',
  sales: 'Sales Rep',
  stock_manager: 'Stock Manager',
  qa_officer: 'QA Officer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Full system and database configuration controls',
  report_viewer: 'Read-only analytics and search capability',
  production: 'Log factory output and print batch labels',
  warehouse_receiving: 'Scan and count batch stock levels',
  warehouse_withdrawal: 'FEFO-guided order item picking',
  sales: 'Register orders and profile retail customers',
  stock_manager: 'Manage product records and stock approvals',
  qa_officer: 'Place quality holds and inspect complaints',
};

// ---- JWT Auth State ----

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  role: UserRole;
  permissions: Permissions;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_KEY = 'crm_auth';
const API_URL = 'http://localhost:3001';

function loadAuth(): { user: AuthUser; token: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuth(data: { user: AuthUser; token: string }) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export function getToken(): string | null {
  const auth = loadAuth();
  return auth?.token ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<{ user: AuthUser; token: string } | null>(loadAuth);
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    const saved = loadAuth();
    if (saved) {
      (async () => {
        try {
          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${saved.token}` },
          });
          const json = await res.json();
          if (json.data) {
            // Token is still valid
            setAuth({ user: json.data, token: saved.token });
          } else {
            // Token expired
            clearAuth();
            setAuth(null);
          }
        } catch {
          // Server might be down, keep session
          setAuth(saved);
        }
      })();
    }
    setLoading(false);
  }, []);

  const role: UserRole = auth?.user?.role || 'sales';
  const permissions = ROLE_PERMISSIONS[role];

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (json.error) {
        return { error: json.error.message };
      }
      const authData = {
        user: { id: json.data.id, email: json.data.email, role: json.data.role as UserRole, name: json.data.name },
        token: json.data.token,
      };
      saveAuth(authData);
      setAuth(authData);
      return { error: null };
    } catch {
      return { error: 'Could not connect to server. Is the backend running?' };
    }
  };

  const signOut = async () => {
    clearAuth();
    setAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: auth?.user ?? null,
        token: auth?.token ?? null,
        role,
        permissions,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getRolePermissions(role: UserRole): Permissions {
  return ROLE_PERMISSIONS[role];
}
