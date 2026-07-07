import { useEffect, useState, useCallback } from 'react';
import { supabase, type Product } from '../api/client';
import { useAuth } from '../api/auth';
import { LoadingState, ErrorState, EmptyState } from '../components/ui';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ProductForm } from '../components/forms/ProductForm';
import { Package, Plus, Search, Pencil, Trash2 } from 'lucide-react';

export function ProductsPage() {
  const { permissions } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({});
  
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('products').select('*');

      if (search.trim()) {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`);
      }

      const { data, error: err } = await query.order('name', { ascending: true });

      if (err) throw err;
      setProducts(data ?? []);

      // Calculate total current stock per product from received batches
      const { data: batches } = await supabase
        .from('batches')
        .select('product_id, quantity_remaining')
        .neq('status', 'produced_pending_receipt');
        
      if (batches) {
        const stocks: Record<string, number> = {};
        batches.forEach(b => {
          stocks[b.product_id] = (stocks[b.product_id] || 0) + (b.quantity_remaining || 0);
        });
        setStockLevels(stocks);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error: err } = await supabase.from('products').delete().eq('id', deleteTarget.id);
      if (err) throw err;
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleEditClick = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleFormSaved = () => {
    setFormOpen(false);
    setEditing(null);
    load();
  };

  if (loading) return <LoadingState message="Loading product catalog..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Package className="h-6 w-6 text-brand-500" />
            Product Catalog
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage 2BFC cappuccino, wafers, cookies, chocolates, cap sizes, and shelf lives.</p>
        </div>

        {permissions.canEditProducts && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            New Product
          </button>
        )}
      </div>

      {/* Filter and search */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
            placeholder="Search by name, SKU or barcode..."
          />
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products found" message="Try adjusting your search query." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-6 py-4">Product Details</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4">Barcode</th>
                <th className="px-6 py-4">Current Stock</th>
                <th className="px-6 py-4">Units per Box</th>
                <th className="px-6 py-4">Shelf Life</th>
                {permissions.canEditProducts && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-semibold">{p.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-600">{p.sku}</td>
                  <td className="px-6 py-4 text-slate-500">{p.barcode || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {stockLevels[p.id] || 0} Boxes
                    </span>
                  </td>
                  <td className="px-6 py-4">{p.units_per_box !== null ? p.units_per_box : <span className="text-red-500 text-xs font-semibold">⚠️ Unconfigured</span>}</td>
                  <td className="px-6 py-4">{p.shelf_life_days !== null ? `${p.shelf_life_days} Days` : <span className="text-red-500 text-xs font-semibold">⚠️ Unconfigured</span>}</td>
                  {permissions.canEditProducts && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleEditClick(p)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Product' : 'Create Product'} size="md">
        <ProductForm product={editing} onSaved={handleFormSaved} onCancel={() => setFormOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
