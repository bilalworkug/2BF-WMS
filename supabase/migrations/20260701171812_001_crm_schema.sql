/*
# CrumbCRM — Core CRM Schema

## Purpose
Customer Relationship Management system for a biscuit factory.
Tracks customers, products (biscuits), orders, and interaction history.

## 1. New Tables

### `customers`
- `id` (uuid, PK)
- `company_name` (text, not null) — shop/supermarket/school name
- `contact_person` (text)
- `phone` (text)
- `email` (text)
- `address` (text)
- `tax_number` (text) — VAT/tax ID
- `notes` (text)
- `created_at` (timestamptz, default now)

### `products`
- `id` (uuid, PK)
- `name` (text, not null) — biscuit name
- `description` (text)
- `sku` (text, unique, not null) — internal stock keeping unit
- `barcode` (text, unique) — barcode for scanner input
- `unit_price` (numeric(10,2), not null, default 0)
- `stock_quantity` (integer, not null, default 0)
- `min_stock_level` (integer, not null, default 0) — alert threshold
- `image_url` (text) — optional product photo
- `created_at` (timestamptz, default now)

### `orders`
- `id` (uuid, PK)
- `order_number` (text, unique, not null) — human-readable, e.g. ORD-2024-0001
- `barcode` (text, unique) — barcode for scanner input
- `customer_id` (uuid, FK -> customers.id)
- `order_date` (date, not null, default today)
- `expected_delivery_date` (date)
- `status` (text, not null, default 'Draft') — Draft|Confirmed|Shipped|Delivered|Cancelled
- `notes` (text)
- `created_at` (timestamptz, default now)

### `order_items`
- `id` (uuid, PK)
- `order_id` (uuid, FK -> orders.id, ON DELETE CASCADE)
- `product_id` (uuid, FK -> products.id)
- `product_name` (text, not null) — snapshot at order time
- `quantity` (integer, not null, default 1)
- `unit_price` (numeric(10,2), not null, default 0) — snapshot at order time
- `created_at` (timestamptz, default now)

### `interactions`
- `id` (uuid, PK)
- `customer_id` (uuid, FK -> customers.id, ON DELETE CASCADE)
- `type` (text, not null) — Call|Meeting|Email|Note
- `subject` (text)
- `details` (text)
- `interaction_date` (timestamptz, not null, default now)
- `created_at` (timestamptz, default now)

### `stock_movements`
- `id` (uuid, PK)
- `product_id` (uuid, FK -> products.id)
- `quantity_change` (integer, not null) — positive for receive, negative for ship
- `reason` (text) — e.g. "Received", "Order ORD-0001 shipped", "Manual adjustment"
- `created_at` (timestamptz, default now)

## 2. Security
- RLS enabled on all tables.
- Policies scoped to `authenticated` users (app has a sign-in screen).
- All CRUD operations allowed for any authenticated user (shared CRM — all staff see all data).

## 3. Indexes
- `products.sku` (unique)
- `products.barcode` (unique)
- `orders.order_number` (unique)
- `orders.barcode` (unique)
- `orders.customer_id`
- `order_items.order_id`
- `interactions.customer_id`
- `stock_movements.product_id`
*/

-- ============ customers ============
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_customers" ON customers;
CREATE POLICY "auth_select_customers" ON customers FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_customers" ON customers;
CREATE POLICY "auth_insert_customers" ON customers FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_customers" ON customers;
CREATE POLICY "auth_update_customers" ON customers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_customers" ON customers;
CREATE POLICY "auth_delete_customers" ON customers FOR DELETE
  TO authenticated USING (true);

-- ============ products ============
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sku text NOT NULL,
  barcode text,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  min_stock_level integer NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON products (sku);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_key ON products (barcode) WHERE barcode IS NOT NULL;

DROP POLICY IF EXISTS "auth_select_products" ON products;
CREATE POLICY "auth_select_products" ON products FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products" ON products FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "auth_delete_products" ON products FOR DELETE
  TO authenticated USING (true);

-- ============ orders ============
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  barcode text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  status text NOT NULL DEFAULT 'Draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key ON orders (order_number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_barcode_key ON orders (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);

DROP POLICY IF EXISTS "auth_select_orders" ON orders;
CREATE POLICY "auth_select_orders" ON orders FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_orders" ON orders;
CREATE POLICY "auth_insert_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_orders" ON orders;
CREATE POLICY "auth_update_orders" ON orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_orders" ON orders;
CREATE POLICY "auth_delete_orders" ON orders FOR DELETE
  TO authenticated USING (true);

-- ============ order_items ============
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

DROP POLICY IF EXISTS "auth_select_order_items" ON order_items;
CREATE POLICY "auth_select_order_items" ON order_items FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_order_items" ON order_items;
CREATE POLICY "auth_insert_order_items" ON order_items FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_order_items" ON order_items;
CREATE POLICY "auth_update_order_items" ON order_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_order_items" ON order_items;
CREATE POLICY "auth_delete_order_items" ON order_items FOR DELETE
  TO authenticated USING (true);

-- ============ interactions ============
CREATE TABLE IF NOT EXISTS interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type text NOT NULL,
  subject text,
  details text,
  interaction_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS interactions_customer_id_idx ON interactions (customer_id);

DROP POLICY IF EXISTS "auth_select_interactions" ON interactions;
CREATE POLICY "auth_select_interactions" ON interactions FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_interactions" ON interactions;
CREATE POLICY "auth_insert_interactions" ON interactions FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_interactions" ON interactions;
CREATE POLICY "auth_update_interactions" ON interactions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_interactions" ON interactions;
CREATE POLICY "auth_delete_interactions" ON interactions FOR DELETE
  TO authenticated USING (true);

-- ============ stock_movements ============
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_change integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS stock_movements_product_id_idx ON stock_movements (product_id);

DROP POLICY IF EXISTS "auth_select_stock_movements" ON stock_movements;
CREATE POLICY "auth_select_stock_movements" ON stock_movements FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_stock_movements" ON stock_movements;
CREATE POLICY "auth_insert_stock_movements" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_stock_movements" ON stock_movements;
CREATE POLICY "auth_update_stock_movements" ON stock_movements FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_stock_movements" ON stock_movements;
CREATE POLICY "auth_delete_stock_movements" ON stock_movements FOR DELETE
  TO authenticated USING (true);
