# CrumbCRM — Biscuit Factory CRM

A complete Customer Relationship Management system for biscuit factories. Track customers, manage orders, scan barcodes, and monitor inventory — all in one clean, modern web app.

## Features

- **Dashboard** — Live metrics: total customers, monthly orders, monthly revenue, low-stock alerts, recent orders
- **Customer Management** — Add/edit/delete customers, search, interaction history (calls, meetings, emails), total orders & spend per customer
- **Product Management** — Biscuit products with SKU, barcode, price, stock levels, low-stock alerts, optional images
- **Order Management** — Create orders with multiple line items, status tracking (Draft → Confirmed → Shipped → Delivered), auto stock deduction on "Shipped", print order summary
- **Barcode Scanning** — Scan products on the Products page, scan orders on the Orders page, receive stock by scanning on the Receiving page
- **Reports** — Sales by product, sales by customer, stock report with total inventory value
- **Authentication** — Secure login with role-based access (Admin, Warehouse, Sales)

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

The app will open at `http://localhost:5173`.

### Default Login

The app has three user roles, each with different access:

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@crumbcrm.local | admin123 | Everything + user management |
| Warehouse Staff | warehouse@crumbcrm.local | warehouse123 | Products, receive stock, order status |
| Sales Rep | sales@crumbcrm.local | sales123 | Customers, orders, dashboard |

On the login page, click the role buttons (Admin, Warehouse, Sales) to auto-fill credentials.

## How to Use

### Barcode Scanning

Your barcode scanner works like a keyboard — it types numbers and presses Enter. The app has dedicated barcode input fields that automatically capture this input:

1. **Products page** — Scan a product barcode to find it instantly and adjust its stock
2. **Orders page** — Scan an order barcode to pull up that order immediately
3. **Receive Stock page** — Scan incoming product barcodes to increase stock counts

Just click on any barcode field (they auto-focus when the page loads) and scan away.

### Creating an Order

1. Go to **Orders** → click **New Order**
2. Select a customer (or leave as Walk-in)
3. Click **Add Product** and search/scan for products
4. Adjust quantities and unit prices as needed
5. Set the status (Draft, Confirmed, etc.)
6. Click **Save Order**

When you change an order's status to **Shipped**, stock is automatically deducted from each product. If you change it back, stock is restored.

### Low Stock Alerts

Products with stock at or below their minimum level are:
- Highlighted in amber on the Products page
- Shown on the Dashboard
- Filterable with the "Low Stock Only" button

## Sample Data

The database comes pre-loaded with:
- **8 biscuit products** (Choco Chip Deluxe, Oat Crunch, Cream Sandwich, Digestive, Ginger Snap, Shortbread, Marie Gold, etc.)
- **3 sample customers** (FreshMart Supermarket, Sunrise Primary School, Mama T Corner Shop)
- **1 sample interaction** log entry

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Backend/Database:** Supabase (PostgreSQL + Auth)
- **Authentication:** Supabase Auth (email/password)

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── AppShell.tsx     # Sidebar navigation + layout
│   ├── CustomerForm.tsx # Add/edit customer form
│   ├── Modal.tsx        # Modal + confirm dialog
│   ├── OrderForm.tsx    # Create/edit order with line items
│   ├── ProductForm.tsx  # Add/edit product form
│   └── ui.tsx           # Spinner, badges, loading/error states
├── lib/
│   ├── auth.tsx         # Auth context (login, session, roles)
│   ├── format.ts        # Currency, date formatting, ID generators
│   └── supabase.ts      # Supabase client + TypeScript types
├── pages/
│   ├── CustomerProfile.tsx  # Customer detail + interaction history
│   ├── CustomersPage.tsx    # Customer list with search
│   ├── DashboardPage.tsx    # Home with metrics
│   ├── LoginPage.tsx        # Sign-in screen
│   ├── OrderDetail.tsx      # Order summary + status changes + print
│   ├── OrdersPage.tsx       # Order list + barcode scan
│   ├── ProductsPage.tsx     # Product list + barcode scan + stock adjust
│   ├── ReceivingPage.tsx    # Scan to receive stock
│   └── ReportsPage.tsx      # Sales & stock reports
├── App.tsx              # Root component + routing
├── main.tsx             # Entry point
└── index.css            # Tailwind + print styles
```

## Database Schema

The app uses Supabase (PostgreSQL) with these tables:

| Table | Purpose |
|-------|---------|
| `customers` | Company name, contact, phone, email, address, tax number, notes |
| `products` | Biscuit name, SKU, barcode, price, stock, min stock level, image |
| `orders` | Order number, barcode, customer, dates, status, notes |
| `order_items` | Line items: product, quantity, unit price (snapshot) |
| `interactions` | Customer interaction log: type, subject, details, date |
| `stock_movements` | Stock change audit trail: product, quantity change, reason |

**Auto stock deduction:** A database trigger automatically deducts product stock when an order is marked "Shipped" and restores it if the status changes back.

## Building for Production

```bash
# Build the app
npm run build

# Preview the production build
npm run preview
```

The built files will be in the `dist/` folder. You can serve them with any static file server (nginx, Apache, or a simple Node server).

## Adding New Users

To add more users (e.g., a warehouse staff member), you can either:
1. Use the Supabase dashboard → Authentication → Users → Add user
2. Or ask a developer to insert a new row in the `auth.users` table

## Troubleshooting

**Can't log in?** Make sure you're using the exact credentials: `admin@crumbcrm.local` / `admin123`

**Data not showing?** The database is pre-configured. If you see empty pages, refresh the page — the app loads data from Supabase in real time.

**Barcode scanner not working?** Make sure the cursor is in a barcode input field. The fields auto-focus on page load. Your scanner should be in "keyboard emulation" mode (the default for most USB scanners).
