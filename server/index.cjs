/**
 * 2BFC CRM — Real Backend Server
 *
 * SQLite database + JWT authentication + Express API.
 * Replaces the old JSON-file server with a proper database.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'crm.db');
const JWT_SECRET = process.env.JWT_SECRET || '2bfc-crm-secret-key-change-in-production';

const corsOptions = {
  origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// ====================================================================
// DATABASE SETUP
// ====================================================================

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const ALLOWED_TABLES = new Set([
  'users',
  'customers',
  'products',
  'batches',
  'receipt_discrepancies',
  'orders',
  'order_lines',
  'order_line_batches',
  'damage_reports',
  'quality_holds',
  'audit_log',
]);

const TABLE_COLUMNS = {
  users: ['id', 'email', 'password_hash', 'name', 'role', 'is_active', 'is_banned', 'failed_login_count', 'lockout_until', 'created_at'],
  customers: ['id', 'name', 'phone', 'address', 'created_by_user_id', 'created_at'],
  products: ['id', 'name', 'sku', 'barcode', 'units_per_box', 'shelf_life_days', 'is_active', 'created_at'],
  batches: ['id', 'batch_code', 'product_id', 'quantity_produced', 'quantity_received', 'quantity_remaining', 'production_date', 'expiry_date', 'status', 'produced_by_user_id', 'received_by_user_id', 'received_at', 'created_at'],
  receipt_discrepancies: ['id', 'batch_id', 'expected_quantity', 'actual_quantity', 'flagged_by_user_id', 'status', 'resolved_by_user_id', 'resolution_note', 'created_at'],
  orders: ['id', 'order_number', 'customer_id', 'sales_person_user_id', 'status', 'order_date', 'dispatched_at', 'created_at'],
  order_lines: ['id', 'order_id', 'product_id', 'quantity_boxes', 'quantity_units', 'quantity_fulfilled_units', 'created_at'],
  order_line_batches: ['id', 'order_line_id', 'batch_id', 'quantity_units', 'fulfilled_by_user_id', 'fulfilled_at'],
  damage_reports: ['id', 'batch_id', 'source', 'quantity', 'reason', 'reported_by_user_id', 'status', 'decided_by_user_id', 'decision_note', 'order_id', 'created_at'],
  quality_holds: ['id', 'batch_id', 'placed_by_user_id', 'reason', 'status', 'released_by_user_id', 'created_at'],
  audit_log: ['id', 'user_id', 'action_type', 'entity_type', 'entity_id', 'details', 'ip_or_device', 'created_at'],
};

// Access policies mapped to the WMS roles matrix
const ROLE_ACCESS = {
  super_admin: { read: new Set(ALLOWED_TABLES), write: new Set(ALLOWED_TABLES) },
  report_viewer: { read: new Set(['products', 'batches', 'orders', 'order_lines', 'order_line_batches', 'customers', 'damage_reports', 'quality_holds', 'audit_log']), write: new Set() },
  production: { read: new Set(['products', 'batches']), write: new Set(['batches']) },
  warehouse_receiving: { read: new Set(['products', 'batches', 'receipt_discrepancies']), write: new Set(['batches', 'receipt_discrepancies']) },
  warehouse_withdrawal: { read: new Set(['products', 'batches', 'orders', 'order_lines', 'order_line_batches', 'damage_reports']), write: new Set(['order_line_batches', 'damage_reports']) },
  sales: { read: new Set(['products', 'customers', 'orders', 'order_lines']), write: new Set(['customers', 'orders', 'order_lines']) },
  stock_manager: { read: new Set(ALLOWED_TABLES), write: new Set(['products', 'receipt_discrepancies', 'damage_reports']) },
  qa_officer: { read: new Set(['products', 'batches', 'damage_reports', 'quality_holds']), write: new Set(['quality_holds', 'damage_reports']) },
};

function isSafeIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function assertAllowedTable(table) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table not allowed: ${table}`);
  }
}

function assertAllowedColumn(table, column) {
  assertAllowedTable(table);
  const allowed = TABLE_COLUMNS[table] || [];
  if (!allowed.includes(column)) {
    throw new Error(`Column not allowed: ${table}.${column}`);
  }
}

function canAccessTable(role, table, action) {
  const access = ROLE_ACCESS[role] || ROLE_ACCESS.report_viewer;
  return access[action]?.has(table) || false;
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'report_viewer',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_banned INTEGER NOT NULL DEFAULT 0,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      lockout_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT,
      units_per_box INTEGER,
      shelf_life_days INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      batch_code TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity_produced INTEGER NOT NULL,
      quantity_received INTEGER,
      quantity_remaining INTEGER NOT NULL,
      production_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'produced_pending_receipt',
      produced_by_user_id TEXT NOT NULL REFERENCES users(id),
      received_by_user_id REFERENCES users(id),
      received_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipt_discrepancies (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      expected_quantity INTEGER NOT NULL,
      actual_quantity INTEGER NOT NULL,
      flagged_by_user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending_approval',
      resolved_by_user_id REFERENCES users(id),
      resolution_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      order_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      sales_person_user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      order_date TEXT NOT NULL DEFAULT (date('now')),
      dispatched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_lines (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE SET NULL,
      quantity_boxes INTEGER NOT NULL,
      quantity_units INTEGER NOT NULL,
      quantity_fulfilled_units INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_line_batches (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      order_line_id TEXT NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      quantity_units INTEGER NOT NULL,
      fulfilled_by_user_id TEXT NOT NULL REFERENCES users(id),
      fulfilled_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS damage_reports (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reported_by_user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending_approval',
      decided_by_user_id REFERENCES users(id),
      decision_note TEXT,
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quality_holds (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      placed_by_user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      released_by_user_id REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_or_device TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_batches_code ON batches(batch_code);
    CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
  );

  const adminHash = bcrypt.hashSync('admin123', 10);
  const prodHash = bcrypt.hashSync('production123', 10);
  const recvHash = bcrypt.hashSync('receiving123', 10);
  const withHash = bcrypt.hashSync('withdrawal123', 10);
  const salesHash = bcrypt.hashSync('sales123', 10);
  const stockHash = bcrypt.hashSync('stock123', 10);
  const qaHash = bcrypt.hashSync('qa123', 10);

  insertUser.run('u1', 'admin@2bfc.local', adminHash, 'Super Admin One', 'super_admin');
  insertUser.run('u2', 'admin2@2bfc.local', adminHash, 'Super Admin Two', 'super_admin');
  insertUser.run('u3', 'production@2bfc.local', prodHash, 'Production Operator', 'production');
  insertUser.run('u4', 'receiving@2bfc.local', recvHash, 'Receiving Clerk', 'warehouse_receiving');
  insertUser.run('u5', 'withdrawal@2bfc.local', withHash, 'Withdrawal Clerk', 'warehouse_withdrawal');
  insertUser.run('u6', 'sales@2bfc.local', salesHash, 'Sales Rep', 'sales');
  insertUser.run('u7', 'stock@2bfc.local', stockHash, 'Stock Manager', 'stock_manager');
  insertUser.run('u8', 'qa@2bfc.local', qaHash, 'QA Inspector', 'qa_officer');

  const insertCustomer = db.prepare(
    'INSERT INTO customers (id, name, phone, address, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
  );

  insertCustomer.run('c1', 'Merkato General Trading', '+251-911-001001', 'Merkato Zone 3, Addis Ababa', 'u6');
  insertCustomer.run('c2', 'Adama Star Wholesale', '+251-912-002002', 'Main Rd, Adama', 'u6');
  insertCustomer.run('c3', 'Hawassa Food Distributors', '+251-913-003003', 'Lake Side Ave, Hawassa', 'u6');

  const insertProduct = db.prepare(
    'INSERT INTO products (id, name, sku, barcode, units_per_box, shelf_life_days) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const products = [
    ['p1', 'Brothers First Cappuccino', 'BFC', '6001234000101', null, null],
    ['p2', 'Brothers First Mango', 'BFM', '6001234000102', null, null],
    ['p3', 'Brothers First Vanilla', 'BFV', '6001234000103', null, null],
    ['p4', 'Brothers Crown', 'BCR', '6001234000104', null, null],
    ['p5', 'Brothers Glory', 'BGL', '6001234000105', null, null],
    ['p6', 'Brothers Fegegta', 'BFG', '6001234000106', null, null],
    ['p7', 'Brothers My Cracker', 'BMC', '6001234000107', null, null],
    ['p8', 'Brothers Nurten', 'BNU', '6001234000108', null, null],
    ['p9', 'Brothers To Your Finger', 'BTF', '6001234000109', null, null],
    ['p10', 'Brothers Top Glucose', 'BTG', '6001234000201', null, null],
    ['p11', 'Brothers Viva Cookies', 'BVC', '6001234000202', null, null],
    ['p12', 'Brothers Wafer Creams', 'BWC', '6001234000301', null, null],
    ['p13', '2BF Chocolates', '2BF', '6001234000401', null, null]
  ];

  for (const p of products) {
    insertProduct.run(...p);
  }

  const insertOrder = db.prepare(
    'INSERT INTO orders (id, order_number, customer_id, sales_person_user_id, status, order_date) VALUES (?, ?, ?, ?, ?, ?)'
  );

  insertOrder.run('o1', 'ORD-260701-001', 'c1', 'u6', 'pending', '2026-07-01');
  insertOrder.run('o2', 'ORD-260702-001', 'c2', 'u6', 'pending', '2026-07-02');
  insertOrder.run('o3', 'ORD-260703-001', 'c3', 'u6', 'pending', '2026-07-03');

  const insertOrderLine = db.prepare(
    'INSERT INTO order_lines (id, order_id, product_id, quantity_boxes, quantity_units, quantity_fulfilled_units) VALUES (?, ?, ?, ?, ?, ?)'
  );
  
  insertOrderLine.run('ol1', 'o1', 'p1', 10, 240, 0);
  insertOrderLine.run('ol2', 'o1', 'p2', 5, 120, 0);
  insertOrderLine.run('ol3', 'o2', 'p3', 15, 360, 0);
  insertOrderLine.run('ol4', 'o3', 'p4', 8, 192, 0);

  console.log('  \u2705 Database seeded with WMS default data');
}

// ====================================================================
// JWT MIDDLEWARE
// ====================================================================

function authMiddleware(req, res, next) {
  const publicPaths = ['/api/auth/login', '/api/auth/register', '/api/health'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'No token provided' } });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
}

app.use(authMiddleware);

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: { message: 'Super Admin access required' } });
  }
  return next();
}

// Helper to record login failed audit log and handle lockout thresholds
function handleFailedLoginAttempt(user, email) {
  db.prepare('INSERT INTO audit_log (action_type, entity_type, details) VALUES (?, ?, ?)')
    .run('login_failed', 'user', JSON.stringify({ email }));
  
  if (user) {
    const failedCount = user.failed_login_count + 1;
    db.prepare('UPDATE users SET failed_login_count = ? WHERE id = ?').run(failedCount, user.id);

    // Count failures in the last 24h
    const recentFailures = db.prepare(`
      SELECT COUNT(*) as count FROM audit_log 
      WHERE action_type = 'login_failed' 
      AND created_at >= datetime('now', '-24 hours')
    `).get().count;

    if (recentFailures >= 10) {
      db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(user.id);
      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'login_banned', 'user', ?, '10 failed attempts inside rolling 24h')")
        .run(user.id, user.id);
    } else if (failedCount >= 5) {
      const lockoutTime = new Date(Date.now() + 15 * 60000).toISOString(); // 15 mins
      db.prepare('UPDATE users SET lockout_until = ? WHERE id = ?').run(lockoutTime, user.id);
      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'login_locked', 'user', ?, 'Locked out for 15 mins')")
        .run(user.id, user.id);
    }
  }
}

// ====================================================================
// AUTH ENDPOINTS
// ====================================================================

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { message: 'Email and password are required' } });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: { message: 'Email already registered' } });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const id = `u${Date.now()}`;
    const userRole = 'sales';

    db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
      .run(id, email.toLowerCase(), passwordHash, name || '', userRole);

    const token = jwt.sign(
      { id, email: email.toLowerCase(), role: userRole, name: name || '' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      data: { id, email: email.toLowerCase(), role: userRole, name: name || '', token },
      error: null,
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { message: 'Email and password are required' } });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    
    if (user && user.is_banned === 1) {
      return res.status(403).json({ error: { message: 'Account is locked. Contact your Super Admin.' } });
    }

    if (user && user.lockout_until) {
      const lockTime = new Date(user.lockout_until);
      if (lockTime > new Date()) {
        const diff = Math.ceil((lockTime - new Date()) / 60000);
        return res.status(403).json({ error: { message: `Too many failed attempts. Try again in ${diff} minutes.` } });
      }
    }

    if (!user) {
      handleFailedLoginAttempt(null, email);
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      handleFailedLoginAttempt(user, email);
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    // Success: reset counters
    db.prepare('UPDATE users SET failed_login_count = 0, lockout_until = NULL WHERE id = ?').run(user.id);
    db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id) VALUES (?, 'login_success', 'user', ?)")
      .run(user.id, user.id);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      data: { id: user.id, email: user.email, role: user.role, name: user.name, token },
      error: null,
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    res.json({ data: user, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ====================================================================
// USERS MANAGEMENT
// ====================================================================

app.get('/api/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
    res.json({ data: users, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: { message: 'Cannot delete yourself' } });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ====================================================================
// STOCK TRIGGER (handled in-app for SQLite)
// ====================================================================

function handleStockOnStatusChange(oldStatus, newStatus, orderId, orderNumber) {
  if (oldStatus === newStatus) return;

  if (newStatus === 'Shipped' && oldStatus !== 'Shipped') {
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
    const deductStmt = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?');
    const logStmt = db.prepare('INSERT INTO stock_movements (product_id, quantity_change, reason) VALUES (?, ?, ?)');

    for (const item of items) {
      if (item.product_id) {
        deductStmt.run(item.quantity, item.product_id);
        logStmt.run(item.product_id, -item.quantity, `Order ${orderNumber} shipped`);
      }
    }
  }

  if (oldStatus === 'Shipped' && newStatus !== 'Shipped') {
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
    const restoreStmt = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?');
    const logStmt = db.prepare('INSERT INTO stock_movements (product_id, quantity_change, reason) VALUES (?, ?, ?)');

    for (const item of items) {
      if (item.product_id) {
        restoreStmt.run(item.quantity, item.product_id);
        logStmt.run(item.product_id, item.quantity, `Order ${orderNumber} un-shipped (${newStatus})`);
      }
    }
  }
}

// ====================================================================
// QUERY ENGINE
// ====================================================================

function buildWhereClause(table, filters) {
  const conditions = [];
  const params = [];

  for (const f of filters) {
    if (!f.field || !isSafeIdentifier(f.field)) {
      throw new Error('Invalid filter field');
    }
    assertAllowedColumn(table, f.field);
    if (f.type === 'eq') {
      conditions.push(`${f.field} = ?`);
      params.push(f.value);
    } else if (f.type === 'neq') {
      conditions.push(`${f.field} != ?`);
      params.push(f.value);
    } else if (f.type === 'gte') {
      conditions.push(`${f.field} >= ?`);
      params.push(f.value);
    } else if (f.type === 'lte') {
      conditions.push(`${f.field} <= ?`);
      params.push(f.value);
    } else if (f.type === 'in') {
      const placeholders = f.values.map(() => '?').join(',');
      conditions.push(`${f.field} IN (${placeholders})`);
      params.push(...f.values);
    } else if (f.type === 'ilike') {
      const pattern = (f.pattern || '').replace(/%/g, '');
      conditions.push(`LOWER(${f.field}) LIKE ?`);
      params.push(`%${pattern.toLowerCase()}%`);
    } else if (f.type === 'or') {
      const orConditions = f.clauses.map(clause => {
        const parts = clause.split('.');
        if (parts.length >= 3) {
          const field = parts[0];
          const op = parts[1];
          const val = parts.slice(2).join('.');
          if (!isSafeIdentifier(field)) {
            throw new Error('Invalid OR filter field');
          }
          assertAllowedColumn(table, field);
          if (op === 'eq') { params.push(val); return `${field} = ?`; }
          if (op === 'ilike') { params.push(`%${val.toLowerCase()}%`); return `LOWER(${field}) LIKE ?`; }
        }
        return '1=0';
      });
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }

  return { whereSQL: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

app.post('/api/query', (req, res) => {
  try {
    const { table, action, filters = [], order, limit, selectFields, row, rows, head, count } = req.body;

    if (!table) {
      return res.status(400).json({ error: { message: 'Table name is required' } });
    }
    assertAllowedTable(table);
    const mode = action === 'insert' || action === 'update' || action === 'delete' ? 'write' : 'read';
    if (!canAccessTable(req.user.role, table, mode)) {
      return res.status(403).json({ error: { message: 'Not allowed for this role' } });
    }

    // ---- INSERT ----
    if (action === 'insert') {
      const toInsert = rows || (row ? [row] : []);
      const inserted = [];

      if (toInsert.length === 0) {
        return res.json({ data: [], error: null });
      }

      for (const record of toInsert) {
        for (const key of Object.keys(record)) {
          if (!isSafeIdentifier(key)) {
            throw new Error(`Invalid column name: ${key}`);
          }
          assertAllowedColumn(table, key);
        }
      }

      const keys = Object.keys(toInsert[0]);
      const placeholders = keys.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);

      for (const r of toInsert) {
        const vals = keys.map(k => r[k] ?? null);
        stmt.run(...vals);
        inserted.push(r);
      }

      return res.json({ data: inserted, error: null });
    }

    // ---- UPDATE ----
    if (action === 'update') {
      let whereSQL = '1=1';
      let params = [];

      if (filters.length > 0) {
        const clause = buildWhereClause(table, filters);
        whereSQL = clause.whereSQL.replace('WHERE ', '');
        params = clause.params;
      }

      if (!row || typeof row !== 'object') {
        return res.status(400).json({ error: { message: 'Update payload is required' } });
      }
      for (const key of Object.keys(row)) {
        if (!isSafeIdentifier(key)) {
          throw new Error(`Invalid column name: ${key}`);
        }
        assertAllowedColumn(table, key);
      }

      // Handle stock trigger for order status changes
      if (table === 'orders' && row && row.status) {
        const oldOrders = db.prepare(`SELECT id, order_number, status FROM ${table} WHERE ${whereSQL}`).all(...params);
        for (const o of oldOrders) {
          if (o.status !== row.status) {
            handleStockOnStatusChange(o.status, row.status, o.id, o.order_number);
          }
        }
      }

      const setKeys = Object.keys(row);
      const setClauses = setKeys.map(k => `${k} = ?`).join(', ');
      const setValues = setKeys.map(k => row[k]);
      const fullSQL = `UPDATE ${table} SET ${setClauses} WHERE ${whereSQL}`;
      db.prepare(fullSQL).run(...setValues, ...params);

      const updated = db.prepare(`SELECT * FROM ${table} WHERE ${whereSQL}`).all(...params);
      return res.json({ data: updated, error: null });
    }

    // ---- DELETE ----
    if (action === 'delete') {
      let whereSQL = '1=1';
      let params = [];

      if (filters.length > 0) {
        const clause = buildWhereClause(table, filters);
        whereSQL = clause.whereSQL.replace('WHERE ', '');
        params = clause.params;
      }

      db.prepare(`DELETE FROM ${table} WHERE ${whereSQL}`).run(...params);
      return res.json({ data: [], error: null });
    }

    // ---- SELECT ----
    const { whereSQL, params: whereParams } = buildWhereClause(table, filters);
    let sql = `SELECT * FROM ${table} ${whereSQL}`;

    if (order) {
      if (!isSafeIdentifier(order.field)) {
        return res.status(400).json({ error: { message: 'Invalid order field' } });
      }
      assertAllowedColumn(table, order.field);
      const dir = order.ascending !== false ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${order.field} ${dir}`;
    }
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    let result = db.prepare(sql).all(...whereParams);

    // Enrich orders with customer data
    if (table === 'orders' && selectFields && (selectFields.includes('customer') || selectFields === '*')) {
      result = result.map(r => {
        const cust = db.prepare('SELECT company_name, contact_person, phone FROM customers WHERE id = ?').get(r.customer_id);
        return { ...r, customer: cust || null };
      });
    }

    // Enrich orders with order_items
    if (table === 'orders' && selectFields && (selectFields.includes('order_items') || selectFields === '*')) {
      result = result.map(r => {
        if (!r.order_items) {
          const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(r.id);
          return { ...r, order_items: items };
        }
        return r;
      });
    }

    const totalCount = result.length;

    if (head && count) {
      return res.json({ data: null, error: null, count: totalCount });
    }

    return res.json({ data: result, error: null, count: totalCount });
  } catch (err) {
    console.error('Query error:', err);
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).all().map(t => t.name);
  res.json({ status: 'ok', tables });
});

// ---- Reset DB (for development) ----
app.post('/api/reset', (req, res) => {
  db.exec(`
    DELETE FROM audit_log;
    DELETE FROM quality_holds;
    DELETE FROM damage_reports;
    DELETE FROM order_line_batches;
    DELETE FROM order_lines;
    DELETE FROM orders;
    DELETE FROM receipt_discrepancies;
    DELETE FROM batches;
    DELETE FROM products;
    DELETE FROM customers;
    DELETE FROM users;
  `);
  seedData();
  res.json({ status: 'reset', message: 'Database reset to WMS defaults' });
});

// ====================================================================
// WMS SPECIFIC API ENDPOINTS
// ====================================================================

// Log Production
app.post('/api/production/batches', (req, res) => {
  try {
    const { product_id, quantity_produced, production_date, expiry_override, override_reason } = req.body;
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) {
      return res.status(404).json({ error: { message: 'Product not found' } });
    }
    
    if (product.units_per_box === null || product.shelf_life_days === null) {
      return res.status(400).json({ error: { message: "This product's shelf-life is not configured — contact your Stock Manager before logging production" } });
    }

    if (!quantity_produced || quantity_produced <= 0) {
      return res.status(400).json({ error: { message: 'Enter a quantity greater than 0.' } });
    }

    // Default Expiry Calculation
    const prodDate = new Date(production_date);
    let expDate = new Date(prodDate.getTime() + product.shelf_life_days * 24 * 60 * 60 * 1000);
    
    if (expiry_override) {
      if (!override_reason || override_reason.trim().length < 5) {
        return res.status(400).json({ error: { message: 'Please explain why you are overriding the expiry date (min 5 chars).' } });
      }
      expDate = new Date(expiry_override);
    }

    const dateStr = prodDate.toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
    const prefix = `${product.sku}-${dateStr}-`;
    
    // Calculate sequence
    const countToday = db.prepare('SELECT COUNT(*) as count FROM batches WHERE batch_code LIKE ?').get(`${prefix}%`).count;
    const seq = String(countToday + 1).padStart(3, '0');
    const batch_code = `${prefix}${seq}`;

    const batchId = `b${Date.now()}`;
    const expiryStr = expDate.toISOString().slice(0, 10);
    
    db.prepare(`
      INSERT INTO batches (id, batch_code, product_id, quantity_produced, quantity_remaining, production_date, expiry_date, status, produced_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'produced_pending_receipt', ?)
    `).run(batchId, batch_code, product.id, quantity_produced, quantity_produced, production_date, expiryStr, req.user.id);

    db.prepare('INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, 'production_logged', 'batch', batchId, JSON.stringify({ batch_code, quantity: quantity_produced }));

    const newBatch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
    res.json({ data: newBatch });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Confirm Receipt (Warehouse Receiving)
app.post('/api/receiving/confirm', (req, res) => {
  try {
    const { batch_code, actual_quantity } = req.body;
    
    const batch = db.prepare('SELECT * FROM batches WHERE batch_code = ?').get(batch_code);
    if (!batch) {
      return res.status(404).json({ error: { message: 'Batch code not recognized.' } });
    }

    if (batch.status !== 'produced_pending_receipt') {
      return res.status(400).json({ error: { message: 'This batch has already been processed.' } });
    }

    const todayStr = new Date().toISOString().slice(0,10);
    if (batch.expiry_date <= todayStr) {
      db.prepare("UPDATE batches SET status = 'expired' WHERE id = ?").run(batch.id);
      return res.status(400).json({ error: { message: 'This batch has already expired and cannot be received.' } });
    }

    if (parseInt(actual_quantity) === batch.quantity_produced) {
      db.prepare(`
        UPDATE batches 
        SET quantity_received = ?, quantity_remaining = ?, status = 'in_stock', received_by_user_id = ?, received_at = datetime('now')
        WHERE id = ?
      `).run(actual_quantity, actual_quantity, req.user.id, batch.id);

      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'receipt_confirmed', 'batch', ?, 'Received with matching count')")
        .run(req.user.id, batch.id);
      
      res.json({ data: { status: 'success', message: 'Batch confirmed — now in stock.' } });
    } else {
      // Discrepancy
      const discrepancyId = `d${Date.now()}`;
      db.prepare(`
        INSERT INTO receipt_discrepancies (id, batch_id, expected_quantity, actual_quantity, flagged_by_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(discrepancyId, batch.id, batch.quantity_produced, actual_quantity, req.user.id);

      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'receipt_discrepancy_flagged', 'batch', ?, ?)")
        .run(req.user.id, batch.id, JSON.stringify({ expected: batch.quantity_produced, actual: actual_quantity }));

      res.json({ data: { status: 'discrepancy', message: `Quantity mismatch: expected ${batch.quantity_produced}, entered ${actual_quantity}. Flagged for Stock Manager approval.` } });
    }
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Resolve discrepancy
app.post('/api/receiving/discrepancies/:id/resolve', (req, res) => {
  try {
    const discrepancyId = req.params.id;
    const { action, resolution_note, approved_quantity } = req.body;
    
    if (!resolution_note || resolution_note.trim().length < 5) {
      return res.status(400).json({ error: { message: 'Resolution note is required (minimum 5 characters).' } });
    }

    const discrepancy = db.prepare('SELECT * FROM receipt_discrepancies WHERE id = ?').get(discrepancyId);
    if (!discrepancy) {
      return res.status(404).json({ error: { message: 'Discrepancy record not found.' } });
    }

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(discrepancy.batch_id);

    if (action === 'approve') {
      const finalQty = approved_quantity || discrepancy.actual_quantity;
      db.prepare(`
        UPDATE batches 
        SET quantity_received = ?, quantity_remaining = ?, status = 'in_stock', received_by_user_id = ?, received_at = datetime('now')
        WHERE id = ?
      `).run(finalQty, finalQty, discrepancy.flagged_by_user_id, batch.id);

      db.prepare("UPDATE receipt_discrepancies SET status = 'approved', resolved_by_user_id = ?, resolution_note = ? WHERE id = ?")
        .run(req.user.id, resolution_note, discrepancy.id);

      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'discrepancy_resolved_approved', 'batch', ?, ?)")
        .run(req.user.id, batch.id, JSON.stringify({ approved_qty: finalQty, note: resolution_note }));
    } else {
      db.prepare("UPDATE receipt_discrepancies SET status = 'rejected', resolved_by_user_id = ?, resolution_note = ? WHERE id = ?")
        .run(req.user.id, resolution_note, discrepancy.id);
      
      db.prepare("UPDATE batches SET status = 'produced_pending_receipt' WHERE id = ?").run(batch.id);

      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'discrepancy_resolved_rejected', 'batch', ?, ?)")
        .run(req.user.id, batch.id, JSON.stringify({ note: resolution_note }));
    }

    res.json({ data: { message: 'Discrepancy resolved successfully.' } });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// FEFO Pick Suggestions
app.get('/api/orders/:id/pick-suggestion', (req, res) => {
  try {
    const orderId = req.params.id;
    const lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ?').all(orderId);
    
    const todayStr = new Date().toISOString().slice(0, 10);
    const suggestions = [];

    for (const line of lines) {
      const product = db.prepare('SELECT name, sku FROM products WHERE id = ?').get(line.product_id);
      
      const batches = db.prepare(`
        SELECT * FROM batches 
        WHERE product_id = ? AND status = 'in_stock' AND expiry_date > ? AND quantity_remaining > 0
        ORDER BY expiry_date ASC
      `).all(line.product_id, todayStr);

      let needed = line.quantity_units - line.quantity_fulfilled_units;
      const batchSuggestions = [];

      for (const b of batches) {
        if (needed <= 0) break;
        const pull = Math.min(needed, b.quantity_remaining);
        batchSuggestions.push({
          batch_code: b.batch_code,
          expiry_date: b.expiry_date,
          quantity_remaining: b.quantity_remaining,
          suggested_pull: pull
        });
        needed -= pull;
      }

      suggestions.push({
        product_name: product.name,
        product_code: product.sku,
        needed_units: line.quantity_units - line.quantity_fulfilled_units,
        batches: batchSuggestions
      });
    }

    res.json({ data: suggestions });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Fulfill Scan
app.post('/api/orders/:id/fulfill', (req, res) => {
  try {
    const orderId = req.params.id;
    const { batch_code, quantity } = req.body;

    const batch = db.prepare('SELECT * FROM batches WHERE batch_code = ?').get(batch_code);
    if (!batch) {
      return res.status(404).json({ error: { message: 'Batch code not recognized.' } });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (batch.expiry_date <= todayStr) {
      return res.status(400).json({ error: { message: `This batch expired on ${batch.expiry_date} and cannot be dispatched.` } });
    }

    if (batch.status === 'on_hold') {
      return res.status(400).json({ error: { message: 'This batch is on quality hold and cannot be dispatched.' } });
    }

    if (batch.quantity_remaining < quantity) {
      return res.status(400).json({ error: { message: 'Insufficient stock remaining in this batch.' } });
    }

    const orderLine = db.prepare('SELECT * FROM order_lines WHERE order_id = ? AND product_id = ?').get(orderId, batch.product_id);
    if (!orderLine) {
      return res.status(400).json({ error: { message: 'This product is not part of this order.' } });
    }

    // Fulfill
    const newRemaining = batch.quantity_remaining - quantity;
    const newStatus = newRemaining === 0 ? 'fully_dispatched' : 'in_stock';
    
    db.prepare("UPDATE batches SET quantity_remaining = ?, status = ? WHERE id = ?").run(newRemaining, newStatus, batch.id);
    db.prepare("UPDATE order_lines SET quantity_fulfilled_units = quantity_fulfilled_units + ? WHERE id = ?").run(quantity, orderLine.id);

    const lineBatchId = `olb${Date.now()}`;
    db.prepare(`
      INSERT INTO order_line_batches (id, order_line_id, batch_id, quantity_units, fulfilled_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(lineBatchId, orderLine.id, batch.id, quantity, req.user.id);

    // Update order status if complete
    const lines = db.prepare('SELECT quantity_units, quantity_fulfilled_units FROM order_lines WHERE order_id = ?').all(orderId);
    const allDone = lines.every(l => l.quantity_fulfilled_units >= l.quantity_units);
    
    if (allDone) {
      db.prepare("UPDATE orders SET status = 'dispatched', dispatched_at = datetime('now') WHERE id = ?").run(orderId);
    }

    db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'order_fulfilled', 'order', ?, ?)")
      .run(req.user.id, orderId, JSON.stringify({ batch_code, quantity }));

    const updatedOrder = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
    res.json({ data: { status: 'success', order_status: updatedOrder.status } });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Checker Inquiry
app.get('/api/checker/:batch_code', (req, res) => {
  try {
    const batch = db.prepare('SELECT * FROM batches WHERE batch_code = ?').get(req.params.batch_code);
    if (!batch) {
      return res.status(404).json({ error: { message: 'No batch found matching that code.' } });
    }

    const product = db.prepare('SELECT name FROM products WHERE id = ?').get(batch.product_id);
    
    const dispatches = db.prepare(`
      SELECT olb.quantity_units, olb.fulfilled_at, o.order_number, c.name as customer_name
      FROM order_line_batches olb
      JOIN order_lines ol ON olb.order_line_id = ol.id
      JOIN orders o ON ol.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE olb.batch_id = ?
    `).all(batch.id);

    const today = new Date();
    const expiry = new Date(batch.expiry_date);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    res.json({
      data: {
        batch_code: batch.batch_code,
        product_name: product.name,
        status: batch.status,
        quantity_produced: batch.quantity_produced,
        quantity_remaining: batch.quantity_remaining,
        production_date: batch.production_date,
        expiry_date: batch.expiry_date,
        days_remaining: diffDays,
        dispatches: dispatches.map(d => ({
          order_number: d.order_number,
          customer: d.customer_name,
          quantity_units: d.quantity_units,
          date: d.fulfilled_at
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Quality holds
app.post('/api/quality-holds', (req, res) => {
  try {
    const { batch_code, reason, status = 'active' } = req.body;
    const batch = db.prepare('SELECT id FROM batches WHERE batch_code = ?').get(batch_code);
    if (!batch) {
      return res.status(404).json({ error: { message: 'Batch not found.' } });
    }

    db.prepare("UPDATE batches SET status = ? WHERE id = ?").run(status === 'active' ? 'on_hold' : 'in_stock', batch.id);

    const holdId = `hld${Date.now()}`;
    db.prepare(`
      INSERT INTO quality_holds (id, batch_id, placed_by_user_id, reason, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(holdId, batch.id, req.user.id, reason, status);

    db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'hold_placed', 'batch', ?, ?)")
      .run(req.user.id, batch.id, JSON.stringify({ reason }));

    res.json({ data: { message: `Quality hold successfully updated for ${batch_code}.` } });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Damage reports
app.post('/api/damage-reports', (req, res) => {
  try {
    const { batch_code, quantity, reason, source = 'warehouse_discovered' } = req.body;
    const batch = db.prepare('SELECT id, quantity_remaining FROM batches WHERE batch_code = ?').get(batch_code);
    if (!batch) {
      return res.status(404).json({ error: { message: 'Batch code not recognized.' } });
    }

    if (quantity <= 0 || quantity > batch.quantity_remaining) {
      return res.status(400).json({ error: { message: 'Invalid damage quantity.' } });
    }

    const reportId = `dmg${Date.now()}`;
    db.prepare(`
      INSERT INTO damage_reports (id, batch_id, source, quantity, reason, reported_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reportId, batch.id, source, quantity, reason, req.user.id);

    db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'damage_reported', 'batch', ?, ?)")
      .run(req.user.id, batch.id, JSON.stringify({ quantity, reason }));

    res.json({ data: { message: 'Damage report submitted for Stock Manager approval.' } });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Expiry Check Cron simulation
app.post('/api/admin/check-expiries', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stmt = db.prepare(`
      UPDATE batches 
      SET status = 'expired' 
      WHERE expiry_date <= ? AND status IN ('in_stock', 'on_hold', 'produced_pending_receipt')
    `);
    const info = stmt.run(today);
    res.json({ data: { expired_count_updated: info.changes } });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

initializeDatabase();
seedData();

app.listen(PORT, () => {
  console.log(`\n  🏭 2BFC CRM Backend Server running at http://localhost:${PORT}`);
  console.log(`  🗄️  Database: SQLite (${DB_PATH})`);
  console.log(`  🔐 Auth: JWT + bcrypt`);
  console.log(`  🔗 API: http://localhost:${PORT}/api/query\n`);
});
