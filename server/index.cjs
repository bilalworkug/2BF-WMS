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
  origin: process.env.CORS_ORIGIN || [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175'
  ],
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
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
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

  // ---- USERS (8 roles) ----
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
  const viewerHash = bcrypt.hashSync('viewer123', 10);

  insertUser.run('u1', 'admin@2bfc.local', adminHash, 'Abebe Kebede', 'super_admin');
  insertUser.run('u2', 'admin2@2bfc.local', adminHash, 'Dawit Tadesse', 'super_admin');
  insertUser.run('u3', 'production@2bfc.local', prodHash, 'Yohannes Girma', 'production');
  insertUser.run('u4', 'receiving@2bfc.local', recvHash, 'Fasil Hailu', 'warehouse_receiving');
  insertUser.run('u5', 'withdrawal@2bfc.local', withHash, 'Solomon Bekele', 'warehouse_withdrawal');
  insertUser.run('u6', 'sales@2bfc.local', salesHash, 'Tigist Alemayehu', 'sales');
  insertUser.run('u7', 'stock@2bfc.local', stockHash, 'Dereje Worku', 'stock_manager');
  insertUser.run('u8', 'qa@2bfc.local', qaHash, 'Hana Mesfin', 'qa_officer');
  insertUser.run('u9', 'viewer@2bfc.local', viewerHash, 'Meseret Assefa', 'report_viewer');

  // ---- CUSTOMERS (8) ----
  const insertCustomer = db.prepare(
    'INSERT INTO customers (id, name, phone, address, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
  );

  insertCustomer.run('c1', 'Merkato General Trading', '+251-911-001001', 'Merkato Zone 3, Addis Ababa', 'u6');
  insertCustomer.run('c2', 'Adama Star Wholesale', '+251-912-002002', 'Main Rd, Adama', 'u6');
  insertCustomer.run('c3', 'Hawassa Food Distributors', '+251-913-003003', 'Lake Side Ave, Hawassa', 'u6');
  insertCustomer.run('c4', 'Bahir Dar Mart PLC', '+251-914-004004', 'Kebele 14, Bahir Dar', 'u6');
  insertCustomer.run('c5', 'Dire Dawa Sweets Shop', '+251-915-005005', 'Kezira District, Dire Dawa', 'u6');
  insertCustomer.run('c6', 'Jimma Coffee & Snacks', '+251-916-006006', 'Mentina Area, Jimma', 'u6');
  insertCustomer.run('c7', 'Mekelle Northern Supplies', '+251-917-007007', 'Adi Haki, Mekelle', 'u6');
  insertCustomer.run('c8', 'Gondar Royal Distributors', '+251-918-008008', 'Piazza, Gondar', 'u6');

  // ---- PRODUCTS (13) with units_per_box & shelf_life ----
  const insertProduct = db.prepare(
    'INSERT INTO products (id, name, sku, barcode, units_per_box, shelf_life_days) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const products = [
    ['p1', 'Brothers First Cappuccino', 'BFC', '6001234000101', 24, 180],
    ['p2', 'Brothers First Mango', 'BFM', '6001234000102', 24, 120],
    ['p3', 'Brothers First Vanilla', 'BFV', '6001234000103', 24, 120],
    ['p4', 'Brothers Crown', 'BCR', '6001234000104', 12, 90],
    ['p5', 'Brothers Glory', 'BGL', '6001234000105', 12, 90],
    ['p6', 'Brothers Fegegta', 'BFG', '6001234000106', 48, 120],
    ['p7', 'Brothers My Cracker', 'BMC', '6001234000107', 48, 150],
    ['p8', 'Brothers Nurten', 'BNU', '6001234000108', 36, 180],
    ['p9', 'Brothers To Your Finger', 'BTF', '6001234000109', 36, 180],
    ['p10', 'Brothers Top Glucose', 'BTG', '6001234000201', 24, 90],
    ['p11', 'Brothers Viva Cookies', 'BVC', '6001234000202', 24, 90],
    ['p12', 'Brothers Wafer Creams', 'BWC', '6001234000301', 12, 120],
    ['p13', '2BF Chocolates', '2BF', '6001234000401', 12, 240]
  ];

  for (const p of products) {
    insertProduct.run(...p);
  }

  // ---- BATCHES (20) — every status represented ----
  const insertBatch = db.prepare(`
    INSERT INTO batches (id, batch_code, product_id, quantity_produced, quantity_received, quantity_remaining, production_date, expiry_date, status, produced_by_user_id, received_by_user_id, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // in_stock — ready for FEFO picking
  insertBatch.run('b1',  'BFC-260501-001', 'p1',  1000, 1000, 520,  '2026-05-01', '2026-11-01', 'in_stock', 'u3', 'u4', '2026-05-02 09:00:00');
  insertBatch.run('b2',  'BFM-260601-001', 'p2',  500,  500,  260,  '2026-06-01', '2026-10-01', 'in_stock', 'u3', 'u4', '2026-06-02 10:15:00');
  insertBatch.run('b3',  'BFV-260610-001', 'p3',  1200, 1200, 1200, '2026-06-10', '2026-10-10', 'in_stock', 'u3', 'u4', '2026-06-11 11:30:00');
  insertBatch.run('b4',  'BCR-260615-001', 'p4',  800,  800,  416,  '2026-06-15', '2026-09-15', 'in_stock', 'u3', 'u4', '2026-06-16 14:00:00');
  insertBatch.run('b9',  'BFG-260620-001', 'p6',  2400, 2400, 2400, '2026-06-20', '2026-10-20', 'in_stock', 'u3', 'u4', '2026-06-21 08:00:00');
  insertBatch.run('b10', 'BMC-260625-001', 'p7',  1440, 1440, 1440, '2026-06-25', '2026-11-25', 'in_stock', 'u3', 'u4', '2026-06-26 09:30:00');
  insertBatch.run('b11', 'BNU-260628-001', 'p8',  720,  720,  720,  '2026-06-28', '2026-12-28', 'in_stock', 'u3', 'u4', '2026-06-29 10:00:00');
  insertBatch.run('b12', 'BTF-260630-001', 'p9',  1080, 1080, 1080, '2026-06-30', '2026-12-30', 'in_stock', 'u3', 'u4', '2026-07-01 08:15:00');
  insertBatch.run('b13', '2BF-260615-001', 'p13', 600,  600,  600,  '2026-06-15', '2027-02-15', 'in_stock', 'u3', 'u4', '2026-06-16 11:00:00');
  // Older BFC batch (expires sooner — FEFO will pick this first)
  insertBatch.run('b14', 'BFC-260301-001', 'p1',  800,  800,  200,  '2026-03-01', '2026-09-01', 'in_stock', 'u3', 'u4', '2026-03-02 09:00:00');

  // produced_pending_receipt — awaiting warehouse scan
  insertBatch.run('b5',  'BGL-260706-001', 'p5',  1500, null, 1500, '2026-07-06', '2026-10-06', 'produced_pending_receipt', 'u3', null, null);
  insertBatch.run('b15', 'BFC-260707-001', 'p1',  2000, null, 2000, '2026-07-07', '2027-01-07', 'produced_pending_receipt', 'u3', null, null);
  insertBatch.run('b16', 'BCR-260707-001', 'p4',  960,  null, 960,  '2026-07-07', '2026-10-07', 'produced_pending_receipt', 'u3', null, null);

  // expired
  insertBatch.run('b6',  'BTG-260101-001', 'p10', 300,  300,  300,  '2026-01-01', '2026-04-01', 'expired', 'u3', 'u4', '2026-01-02 08:30:00');
  insertBatch.run('b17', 'BVC-260201-001', 'p11', 480,  480,  200,  '2026-02-01', '2026-05-01', 'expired', 'u3', 'u4', '2026-02-02 09:00:00');

  // on_hold (quality)
  insertBatch.run('b7',  'BVC-260620-001', 'p11', 1000, 1000, 1000, '2026-06-20', '2026-09-20', 'on_hold', 'u3', 'u4', '2026-06-21 16:20:00');
  insertBatch.run('b18', 'BWC-260625-001', 'p12', 360,  360,  360,  '2026-06-25', '2026-10-25', 'on_hold', 'u3', 'u4', '2026-06-26 14:00:00');

  // fully_dispatched
  insertBatch.run('b19', 'BFM-260401-001', 'p2',  240,  240,  0,   '2026-04-01', '2026-08-01', 'fully_dispatched', 'u3', 'u4', '2026-04-02 10:00:00');

  // Discrepancy batch (produced_pending_receipt with mismatch flagged)
  insertBatch.run('b8',  'BWC-260705-001', 'p12', 1000, null, 1000, '2026-07-05', '2026-11-05', 'produced_pending_receipt', 'u3', null, null);
  insertBatch.run('b20', 'BGL-260704-001', 'p5',  600,  null, 600,  '2026-07-04', '2026-10-04', 'produced_pending_receipt', 'u3', null, null);

  // ---- RECEIPT DISCREPANCIES (3: pending, approved, rejected) ----
  const insertDiscrepancy = db.prepare(`
    INSERT INTO receipt_discrepancies (id, batch_id, expected_quantity, actual_quantity, flagged_by_user_id, status, resolved_by_user_id, resolution_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDiscrepancy.run('d1', 'b8',  1000, 950, 'u4', 'pending_approval', null, null);
  insertDiscrepancy.run('d2', 'b20', 600,  580, 'u4', 'approved', 'u7', 'Approved after physical recount — 20 units short-packed at production.');
  insertDiscrepancy.run('d3', 'b17', 480,  510, 'u4', 'rejected', 'u7', 'Rejected — recount matched original 480. Clerk miscount.');

  // ---- ORDERS (8: every status) ----
  const insertOrder = db.prepare(
    'INSERT INTO orders (id, order_number, customer_id, sales_person_user_id, status, order_date, dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  insertOrder.run('o1', 'ORD-260701-001', 'c1', 'u6', 'dispatched',           '2026-07-01', '2026-07-02 11:00:00');
  insertOrder.run('o2', 'ORD-260702-001', 'c2', 'u6', 'partially_fulfilled',  '2026-07-02', null);
  insertOrder.run('o3', 'ORD-260703-001', 'c3', 'u6', 'ready_to_pick',        '2026-07-03', null);
  insertOrder.run('o4', 'ORD-260704-001', 'c4', 'u6', 'pending',              '2026-07-04', null);
  insertOrder.run('o5', 'ORD-260704-002', 'c5', 'u6', 'pending',              '2026-07-04', null);
  insertOrder.run('o6', 'ORD-260705-001', 'c6', 'u6', 'ready_to_pick',        '2026-07-05', null);
  insertOrder.run('o7', 'ORD-260706-001', 'c7', 'u6', 'cancelled',            '2026-07-06', null);
  insertOrder.run('o8', 'ORD-260630-001', 'c8', 'u6', 'dispatched',           '2026-06-30', '2026-07-01 15:30:00');

  // ---- ORDER LINES (15) ----
  const insertOrderLine = db.prepare(
    'INSERT INTO order_lines (id, order_id, product_id, quantity_boxes, quantity_units, quantity_fulfilled_units) VALUES (?, ?, ?, ?, ?, ?)'
  );
  
  // o1 — dispatched (fully fulfilled)
  insertOrderLine.run('ol1',  'o1', 'p1', 10, 240, 240);
  insertOrderLine.run('ol2',  'o1', 'p2', 5,  120, 120);

  // o2 — partially fulfilled
  insertOrderLine.run('ol3',  'o2', 'p3', 15, 360, 0);
  insertOrderLine.run('ol4',  'o2', 'p4', 16, 192, 192);

  // o3 — ready to pick
  insertOrderLine.run('ol5',  'o3', 'p1', 8,  192, 0);
  insertOrderLine.run('ol6',  'o3', 'p6', 5,  240, 0);

  // o4 — pending
  insertOrderLine.run('ol7',  'o4', 'p7', 10, 480, 0);
  insertOrderLine.run('ol8',  'o4', 'p8', 5,  180, 0);

  // o5 — pending
  insertOrderLine.run('ol9',  'o5', 'p9',  3, 108, 0);
  insertOrderLine.run('ol10', 'o5', 'p13', 5, 60,  0);

  // o6 — ready to pick
  insertOrderLine.run('ol11', 'o6', 'p2', 10, 240, 0);

  // o7 — cancelled
  insertOrderLine.run('ol12', 'o7', 'p12', 20, 240, 0);

  // o8 — dispatched (fully fulfilled)
  insertOrderLine.run('ol13', 'o8', 'p2',  10, 240, 240);
  insertOrderLine.run('ol14', 'o8', 'p4',  16, 192, 192);
  insertOrderLine.run('ol15', 'o8', 'p1',  10, 240, 240);

  // ---- ORDER LINE BATCHES (fulfillment records) ----
  const insertOrderLineBatch = db.prepare(`
    INSERT INTO order_line_batches (id, order_line_id, batch_id, quantity_units, fulfilled_by_user_id, fulfilled_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // o1 fulfillment
  insertOrderLineBatch.run('olb1', 'ol1', 'b14', 192, 'u5', '2026-07-02 10:30:00');
  insertOrderLineBatch.run('olb2', 'ol1', 'b1',   48, 'u5', '2026-07-02 10:35:00');
  insertOrderLineBatch.run('olb3', 'ol2', 'b2',  120, 'u5', '2026-07-02 10:55:00');

  // o2 partial fulfillment (Crown line done)
  insertOrderLineBatch.run('olb4', 'ol4', 'b4',  192, 'u5', '2026-07-03 09:20:00');

  // o8 fulfillment
  insertOrderLineBatch.run('olb5', 'ol13', 'b19', 240, 'u5', '2026-07-01 14:00:00');
  insertOrderLineBatch.run('olb6', 'ol14', 'b4',  192, 'u5', '2026-07-01 14:15:00');
  insertOrderLineBatch.run('olb7', 'ol15', 'b1',  240, 'u5', '2026-07-01 14:30:00');

  // ---- QUALITY HOLDS (3: active + released) ----
  const insertHold = db.prepare(`
    INSERT INTO quality_holds (id, batch_id, placed_by_user_id, reason, status, released_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertHold.run('h1', 'b7',  'u8', 'Substandard packaging seal found during line inspection.', 'active', null);
  insertHold.run('h2', 'b18', 'u8', 'Moisture detected in wafer cream wrapper.', 'active', null);
  insertHold.run('h3', 'b17', 'u8', 'Suspected mislabelled expiry — sent for verification.', 'released', 'u7');

  // ---- DAMAGE REPORTS (4: pending, approved_writeoff, approved_return_to_stock, rejected) ----
  const insertDamage = db.prepare(`
    INSERT INTO damage_reports (id, batch_id, source, quantity, reason, reported_by_user_id, status, decided_by_user_id, decision_note, order_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDamage.run('dmg1', 'b1',  'warehouse_discovered', 50,  'Crushed cartons from forklift bump in Aisle 3.',                'u5', 'pending_approval',          null, null, null);
  insertDamage.run('dmg2', 'b2',  'warehouse_discovered', 20,  'Water damage — roof leak near Bay 7.',                           'u5', 'approved_writeoff',         'u7', 'Confirmed write-off. Insurance claim filed.', null);
  insertDamage.run('dmg3', 'b4',  'customer_returned',    12,  'Customer complaint: broken biscuits inside sealed packs.',        'u6', 'approved_return_to_stock',  'u7', 'Outer packaging intact. Re-inspected and cleared for resale.', 'o8');
  insertDamage.run('dmg4', 'b3',  'warehouse_discovered', 5,   'Minor dent on carton — product inside intact.',                  'u5', 'rejected',                  'u7', 'Product quality unaffected. No write-off needed.', null);

  // ---- AUDIT LOG (24 entries — comprehensive trail) ----
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Production
  insertAudit.run('u3', 'production_logged',  'batch', 'b1',  JSON.stringify({ batch_code: 'BFC-260501-001', quantity: 1000 }));
  insertAudit.run('u3', 'production_logged',  'batch', 'b2',  JSON.stringify({ batch_code: 'BFM-260601-001', quantity: 500 }));
  insertAudit.run('u3', 'production_logged',  'batch', 'b3',  JSON.stringify({ batch_code: 'BFV-260610-001', quantity: 1200 }));
  insertAudit.run('u3', 'production_logged',  'batch', 'b5',  JSON.stringify({ batch_code: 'BGL-260706-001', quantity: 1500 }));
  insertAudit.run('u3', 'production_logged',  'batch', 'b15', JSON.stringify({ batch_code: 'BFC-260707-001', quantity: 2000 }));

  // Receiving
  insertAudit.run('u4', 'receipt_confirmed',  'batch', 'b1',  'Received with matching count');
  insertAudit.run('u4', 'receipt_confirmed',  'batch', 'b2',  'Received with matching count');
  insertAudit.run('u4', 'receipt_confirmed',  'batch', 'b3',  'Received with matching count');
  insertAudit.run('u4', 'receipt_discrepancy_flagged', 'batch', 'b8',  JSON.stringify({ expected: 1000, actual: 950 }));
  insertAudit.run('u4', 'receipt_discrepancy_flagged', 'batch', 'b20', JSON.stringify({ expected: 600, actual: 580 }));

  // Discrepancy resolution
  insertAudit.run('u7', 'discrepancy_resolved_approved', 'batch', 'b20', JSON.stringify({ approved_qty: 580, note: 'Short-packed at production' }));
  insertAudit.run('u7', 'discrepancy_resolved_rejected', 'batch', 'b17', JSON.stringify({ note: 'Clerk miscount' }));

  // Quality holds
  insertAudit.run('u8', 'hold_placed',   'batch', 'b7',  JSON.stringify({ reason: 'Substandard packaging seal' }));
  insertAudit.run('u8', 'hold_placed',   'batch', 'b18', JSON.stringify({ reason: 'Moisture in wrapper' }));
  insertAudit.run('u7', 'hold_released', 'batch', 'b17', JSON.stringify({ reason: 'Expiry verified correct' }));

  // Order fulfillment
  insertAudit.run('u5', 'order_fulfilled', 'order', 'o1', JSON.stringify({ batch_code: 'BFC-260301-001', quantity: 192 }));
  insertAudit.run('u5', 'order_fulfilled', 'order', 'o1', JSON.stringify({ batch_code: 'BFC-260501-001', quantity: 48 }));
  insertAudit.run('u5', 'order_fulfilled', 'order', 'o1', JSON.stringify({ batch_code: 'BFM-260601-001', quantity: 120 }));
  insertAudit.run('u5', 'order_fulfilled', 'order', 'o8', JSON.stringify({ batch_code: 'BFM-260401-001', quantity: 240 }));

  // Damage reports
  insertAudit.run('u5', 'damage_reported',  'batch', 'b1', JSON.stringify({ quantity: 50, reason: 'Forklift bump' }));
  insertAudit.run('u7', 'damage_approved',  'batch', 'b2', JSON.stringify({ quantity: 20, decision: 'write-off' }));
  insertAudit.run('u7', 'damage_approved',  'batch', 'b4', JSON.stringify({ quantity: 12, decision: 'return to stock' }));
  insertAudit.run('u7', 'damage_rejected',  'batch', 'b3', JSON.stringify({ quantity: 5, note: 'Product unaffected' }));

  // Login
  insertAudit.run('u1', 'login_success', 'user', 'u1', 'Admin login from 192.168.1.5');

  console.log('  \u2705 Database seeded with comprehensive WMS demo data (batch-level only)');
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
    const { batch_code, received_quantity } = req.body;
    
    if (received_quantity === undefined || received_quantity < 0) {
      return res.status(400).json({ error: { message: 'Received quantity is required.' } });
    }

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

    const actual_quantity = received_quantity;

    db.transaction(() => {
      // Update the batch
      if (actual_quantity === batch.quantity_produced) {
        db.prepare(`
          UPDATE batches 
          SET quantity_received = ?, quantity_remaining = ?, status = 'in_stock', received_by_user_id = ?, received_at = datetime('now')
          WHERE id = ?
        `).run(actual_quantity, actual_quantity, req.user.id, batch.id);

        db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'receipt_confirmed', 'batch', ?, 'Received with matching count')")
          .run(req.user.id, batch.id);
      } else {
        // Discrepancy
        const discrepancyId = `d${Date.now()}`;
        db.prepare(`
          INSERT INTO receipt_discrepancies (id, batch_id, expected_quantity, actual_quantity, flagged_by_user_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(discrepancyId, batch.id, batch.quantity_produced, actual_quantity, req.user.id);

        db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'receipt_discrepancy_flagged', 'batch', ?, ?)")
          .run(req.user.id, batch.id, JSON.stringify({ expected: batch.quantity_produced, actual: actual_quantity }));
      }
    })();

    if (actual_quantity === batch.quantity_produced) {
      res.json({ data: { status: 'success', message: 'Batch confirmed — now in stock.' } });
    } else {
      res.json({ data: { status: 'discrepancy', message: `Quantity mismatch: expected ${batch.quantity_produced}, received ${actual_quantity}. Flagged for Stock Manager approval.` } });
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

// Batch-Level Fulfillment (withdraw units from a batch against an order line)
app.post('/api/orders/:id/fulfill', (req, res) => {
  try {
    const orderId = req.params.id;
    const { order_line_id, batch_id, quantity_units } = req.body;

    if (!order_line_id || !batch_id || !quantity_units || quantity_units <= 0) {
      return res.status(400).json({ error: { message: 'order_line_id, batch_id, and quantity_units > 0 are required.' } });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found.' } });
    }

    const orderLine = db.prepare('SELECT * FROM order_lines WHERE id = ? AND order_id = ?').get(order_line_id, orderId);
    if (!orderLine) {
      return res.status(404).json({ error: { message: 'Order line not found in this order.' } });
    }

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batch_id);
    if (!batch) {
      return res.status(404).json({ error: { message: 'Batch not found.' } });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (batch.expiry_date <= todayStr) {
      return res.status(400).json({ error: { message: `Batch expired on ${batch.expiry_date}.` } });
    }
    if (batch.status === 'on_hold') {
      return res.status(400).json({ error: { message: 'Batch is on quality hold.' } });
    }
    if (batch.status !== 'in_stock') {
      return res.status(400).json({ error: { message: `Batch is ${batch.status} — cannot fulfill from it.` } });
    }
    if (quantity_units > batch.quantity_remaining) {
      return res.status(400).json({ error: { message: `Not enough stock in batch. Available: ${batch.quantity_remaining}, requested: ${quantity_units}.` } });
    }

    const remainingNeeded = orderLine.quantity_units - orderLine.quantity_fulfilled_units;
    if (quantity_units > remainingNeeded) {
      return res.status(400).json({ error: { message: `Only ${remainingNeeded} units still needed for this line.` } });
    }

    db.transaction(() => {
      // Decrement batch quantity
      const newRemaining = batch.quantity_remaining - quantity_units;
      const newStatus = newRemaining <= 0 ? 'fully_dispatched' : 'in_stock';
      db.prepare("UPDATE batches SET quantity_remaining = ?, status = ? WHERE id = ?").run(newRemaining, newStatus, batch.id);

      // Update order line fulfillment
      db.prepare("UPDATE order_lines SET quantity_fulfilled_units = quantity_fulfilled_units + ? WHERE id = ?").run(quantity_units, orderLine.id);

      // Record fulfillment
      const olbId = `olb${Date.now()}`;
      db.prepare(`
        INSERT INTO order_line_batches (id, order_line_id, batch_id, quantity_units, fulfilled_by_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(olbId, orderLine.id, batch.id, quantity_units, req.user.id);

      db.prepare("INSERT INTO audit_log (user_id, action_type, entity_type, entity_id, details) VALUES (?, 'order_fulfilled', 'order_line', ?, ?)")
        .run(req.user.id, orderLine.id, JSON.stringify({ batch_id: batch.id, batch_code: batch.batch_code, quantity_units }));

      // Update order status if all lines now complete
      const lines = db.prepare('SELECT quantity_units, quantity_fulfilled_units FROM order_lines WHERE order_id = ?').all(orderId);
      const allDone = lines.every(l => l.quantity_fulfilled_units >= l.quantity_units);
      if (allDone) {
        db.prepare("UPDATE orders SET status = 'dispatched', dispatched_at = datetime('now') WHERE id = ?").run(orderId);
      } else {
        const anyFulfilled = lines.some(l => l.quantity_fulfilled_units > 0);
        if (anyFulfilled) {
          db.prepare("UPDATE orders SET status = 'partially_fulfilled' WHERE id = ?").run(orderId);
        }
      }
    })();

    const updatedOrder = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
    res.json({
      data: {
        fulfilled: quantity_units,
        batch_code: batch.batch_code,
        order_status: updatedOrder.status,
      }
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Checker Inquiry — supports both batch codes and individual box barcodes
app.get('/api/checker/:query', (req, res) => {
  try {
    const query = req.params.query;

    // Look up as a batch code
    const batch = db.prepare('SELECT * FROM batches WHERE batch_code = ?').get(query);
    if (!batch) {
      // Also try product barcode lookup
      const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(query);
      if (product) {
        return res.json({
          data: {
            type: 'product',
            product_name: product.name,
            product_sku: product.sku,
            barcode: product.barcode,
            units_per_box: product.units_per_box,
            shelf_life_days: product.shelf_life_days,
            is_active: product.is_active
          }
        });
      }
      return res.status(404).json({ error: { message: 'No batch or product found matching that code.' } });
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
        type: 'batch',
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

// Quality holds (supports both batch-level and individual box barcode)
app.post('/api/quality-holds', (req, res) => {
  try {
    const { batch_code, reason, status = 'active' } = req.body;

    if (!batch_code) {
      return res.status(400).json({ error: { message: 'Batch code is required.' } });
    }

    // Batch-level hold
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

// Damage reports (batch-level only)
app.post('/api/damage-reports', (req, res) => {
  try {
    const { batch_code, quantity, reason, source = 'warehouse_discovered' } = req.body;

    if (!batch_code) {
      return res.status(400).json({ error: { message: 'Batch code is required.' } });
    }

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
