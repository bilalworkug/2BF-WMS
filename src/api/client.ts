/**
 * 2BFC CRM — Local Backend Client
 * 
 * This module provides a Supabase-compatible API that sends all queries
 * to the local Express server at http://localhost:3001.
 * Data is persisted to disk in server/db.json.
 *
 * Every page that does `supabase.from('table').select(...)` etc.
 * works identically — but now data is saved permanently on the server.
 *
 * DATA: Two Brothers Food Complex P.L.C (2BFC) — Adama, Ethiopia
 */

const API_URL = 'http://localhost:3001/api/query';

// ---- Types ----

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  units_per_box: number | null;
  shelf_life_days: number | null;
  is_active: number;
  created_at: string;
};

export type Batch = {
  id: string;
  batch_code: string;
  product_id: string;
  quantity_produced: number;
  quantity_received: number | null;
  quantity_remaining: number;
  production_date: string;
  expiry_date: string;
  status: 'produced_pending_receipt' | 'in_stock' | 'on_hold' | 'expired' | 'fully_dispatched' | 'written_off';
  produced_by_user_id: string;
  received_by_user_id: string | null;
  received_at: string | null;
  created_at: string;
  product?: Product;
};

export type ReceiptDiscrepancy = {
  id: string;
  batch_id: string;
  expected_quantity: number;
  actual_quantity: number;
  flagged_by_user_id: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  resolved_by_user_id: string | null;
  resolution_note: string | null;
  created_at: string;
  batch?: Batch;
};

export type Order = {
  id: string;
  order_number: string;
  customer_id: string;
  sales_person_user_id: string;
  status: 'pending' | 'ready_to_pick' | 'partially_fulfilled' | 'dispatched' | 'cancelled';
  order_date: string;
  dispatched_at: string | null;
  created_at: string;
  customer?: Customer;
};

export type OrderLine = {
  id: string;
  order_id: string;
  product_id: string;
  quantity_boxes: number;
  quantity_units: number;
  quantity_fulfilled_units: number;
  created_at: string;
  product?: Product;
};

export type OrderLineBatch = {
  id: string;
  order_line_id: string;
  batch_id: string;
  quantity_units: number;
  fulfilled_by_user_id: string;
  fulfilled_at: string;
};

export type DamageReport = {
  id: string;
  batch_id: string;
  source: 'warehouse_discovered' | 'customer_returned';
  quantity: number;
  reason: string;
  reported_by_user_id: string;
  status: 'pending_approval' | 'approved_writeoff' | 'approved_return_to_stock' | 'rejected';
  decided_by_user_id: string | null;
  decision_note: string | null;
  order_id: string | null;
  created_at: string;
};

export type QualityHold = {
  id: string;
  batch_id: string;
  placed_by_user_id: string;
  reason: string;
  status: 'active' | 'released';
  released_by_user_id: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  ip_or_device: string | null;
  created_at: string;
};

// ---- Helpers ----

type Filter = {
  type: 'eq' | 'neq' | 'gte' | 'lte' | 'in' | 'ilike' | 'or';
  field?: string;
  value?: unknown;
  values?: unknown[];
  pattern?: string;
  clauses?: string[];
};

class LocalQuery<T extends Record<string, unknown>> {
  private _table: string;
  private _filters: Filter[] = [];
  private _order: { field: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _selectFields: string | null = null;
  private _head = false;
  private _count: 'exact' | null = null;
  private _insertRows: Partial<T>[] | null = null;
  private _updateRow: Partial<T> | null = null;
  private _deleteMode = false;

  constructor(table: string) {
    this._table = table;
  }

  select(fields: string = '*', options?: { count?: 'exact'; head?: boolean }): this {
    this._selectFields = fields;
    if (options?.count) this._count = options.count;
    if (options?.head) this._head = options.head;
    return this;
  }

  insert(rows: Partial<T> | Partial<T>[]): this {
    this._insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(row: Partial<T>): this {
    this._updateRow = row;
    return this;
  }

  delete(): this {
    this._deleteMode = true;
    return this;
  }

  or(expression: string): this {
    const clauses = expression.split(',');
    this._filters.push({ type: 'or', clauses });
    return this;
  }

  eq(field: string, value: unknown): this {
    this._filters.push({ type: 'eq', field, value });
    return this;
  }

  neq(field: string, value: unknown): this {
    this._filters.push({ type: 'neq', field, value });
    return this;
  }

  gte(field: string, value: unknown): this {
    this._filters.push({ type: 'gte', field, value });
    return this;
  }

  lte(field: string, value: unknown): this {
    this._filters.push({ type: 'lte', field, value });
    return this;
  }

  in(field: string, values: unknown[]): this {
    this._filters.push({ type: 'in', field, values });
    return this;
  }

  ilike(field: string, pattern: string): this {
    this._filters.push({ type: 'ilike', field, pattern });
    return this;
  }

  order(field: string, opts?: { ascending?: boolean }): this {
    this._order = { field, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  single(): Promise<{ data: T | null; error: null }> {
    return this._execute().then((res) => ({
      data: (res.data as T[] | null)?.[0] ?? null,
      error: null,
    }));
  }

  maybeSingle(): Promise<{ data: T | null; error: null }> {
    return this._execute().then((res) => ({
      data: (res.data as T[] | null)?.[0] ?? null,
      error: null,
    }));
  }

  range(from: number, to: number): this {
    this._limit = (to - from) + 1;
    return this;
  }

  then<TResult>(
    resolve: (value: { data: T[] | null; error: null; count?: number }) => TResult
  ): Promise<TResult> {
    return this._execute().then(resolve as any);
  }

  private async _execute(): Promise<{ data: T[] | null; error: null; count?: number }> {
    try {
      let action = 'select';
      let bodyRow: Partial<T> | undefined;
      let bodyRows: Partial<T>[] | undefined;

      if (this._insertRows) {
        action = 'insert';
        bodyRows = this._insertRows;
      } else if (this._updateRow) {
        action = 'update';
        bodyRow = this._updateRow;
      } else if (this._deleteMode) {
        action = 'delete';
      }

      const body = {
        table: this._table,
        action,
        filters: this._filters,
        order: this._order,
        limit: this._limit,
        selectFields: this._selectFields,
        head: this._head,
        count: this._count,
        row: bodyRow,
        rows: bodyRows,
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const stored = JSON.parse(localStorage.getItem('crm_auth') || '{}');
        if (stored.token) {
          headers['Authorization'] = `Bearer ${stored.token}`;
        }
      } catch {
        // Ignore malformed saved auth and continue without an auth header.
      }

      const response = await fetch('http://localhost:3001/api/query', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const result = await response.json();
      return result;
    } catch (err) {
      console.error(`LocalQuery error [${this._table}]:`, err);
      return { data: [], error: null, count: 0 };
    }
  }
}

// ---- Table registry ----

type TableMap = {
  users: any;
  customers: Customer;
  products: Product;
  batches: Batch;
  receipt_discrepancies: ReceiptDiscrepancy;
  orders: Order;
  order_lines: OrderLine;
  order_line_batches: OrderLineBatch;
  damage_reports: DamageReport;
  quality_holds: QualityHold;
  audit_log: AuditLog;
};

// ---- Exported supabase-compatible client ----

export const supabase = {
  from<K extends keyof TableMap>(table: K): LocalQuery<TableMap[K] & Record<string, unknown>> {
    return new LocalQuery<TableMap[K] & Record<string, unknown>>(table as string);
  },
  auth: {
    // Auth is handled by mock auth.tsx — these are no-ops
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: null, error: new Error('Use mock auth') }),
    signOut: () => Promise.resolve({ error: null }),
  },
} as const;
