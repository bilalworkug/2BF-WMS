/*
# Seed Sample Data

## Purpose
Pre-load the CRM with sample biscuit products, a test customer, and an interaction
so the app is immediately usable after setup.

## Data inserted
- 8 biscuit products with SKUs, barcodes, prices, stock levels, and min stock alerts
- 3 sample customers (a supermarket, a school, and a corner shop)
- 1 sample interaction log entry

## Notes
- Uses ON CONFLICT DO NOTHING so re-running is safe.
- The admin auth user is created separately via the Supabase Auth API (see README).
*/

-- ============ Products (Biscuits) ============
INSERT INTO products (name, description, sku, barcode, unit_price, stock_quantity, min_stock_level) VALUES
  ('Choco Chip Deluxe', 'Premium chocolate chip cookies, 200g pack', 'BIS-001', '5012345678001', 2.50, 480, 100),
  ('Oat Crunch', 'Wholesome oat biscuits with honey, 180g pack', 'BIS-002', '5012345678002', 2.20, 35, 80),
  ('Cream Sandwich Vanilla', 'Vanilla cream-filled sandwich biscuits, 150g', 'BIS-003', '5012345678003', 1.80, 620, 150),
  ('Cream Sandwich Chocolate', 'Chocolate cream-filled sandwich biscuits, 150g', 'BIS-004', '5012345678004', 1.80, 590, 150),
  ('Digestive Whole Wheat', 'High-fibre digestive biscuits, 250g pack', 'BIS-005', '5012345678005', 2.80, 210, 100),
  ('Ginger Snap', 'Spiced ginger biscuits, 160g pack', 'BIS-006', '5012345678006', 2.10, 12, 60),
  ('Shortbread Fingers', 'Buttery shortbread fingers, 300g tin', 'BIS-007', '5012345678007', 4.50, 140, 50),
  ('Marie Gold', 'Classic light tea biscuits, 200g pack', 'BIS-008', '5012345678008', 1.50, 800, 200)
ON CONFLICT (sku) DO NOTHING;

-- ============ Customers ============
INSERT INTO customers (company_name, contact_person, phone, email, address, tax_number, notes) VALUES
  ('FreshMart Supermarket', 'John Okoro', '+234 802 111 2222', 'buyer@freshmart.example', '12 Market Road, Lagos', 'TAX-2024-001', 'Chain of 5 supermarkets. Pays on 30-day terms.'),
  ('Sunrise Primary School', 'Mrs. Adaeze Nwosu', '+234 803 333 4444', 'admin@sunriseprimary.example', '45 Education Avenue, Enugu', 'TAX-2024-002', 'Orders biscuits for school snack program. Bulk orders every term.'),
  ('Mama T Corner Shop', 'Mama T', '+234 805 555 6666', '', '8 Olumo Street, Abeokuta', '', 'Small corner shop. Walk-in pickup.')
ON CONFLICT DO NOTHING;

-- ============ Interaction ============
INSERT INTO interactions (customer_id, type, subject, details, interaction_date)
SELECT c.id, 'Call', 'Monthly check-in', 'Called John to confirm next delivery date. He requested extra Choco Chip Deluxe for the holidays.', now()
FROM customers c WHERE c.company_name = 'FreshMart Supermarket'
ON CONFLICT DO NOTHING;
