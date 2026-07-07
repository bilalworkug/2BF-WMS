import { useEffect, useState, useCallback } from 'react';
import { supabase, type Product } from '../api/client';
import { useAuth } from '../api/auth';
import { LoadingState, ErrorState, EmptyState } from '../components/ui';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ProductForm } from '../components/forms/ProductForm';
import { Package, Plus, Search, Pencil, Trash2, Camera } from 'lucide-react';
import { CameraScanner } from '../components/ui/CameraScanner';

export function ProductsPage() {
  const { permissions } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
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
      load();
      if (err) throw err;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="w-7 h-7 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Products</h1>
            <p className="text-sm text-slate-500">{products.length} product{products.length !== 1 ? 's' : ''} registered</p>
          </div>
        </div>
        <div className="flex gap-2">
          {permissions?.can('create', 'products') && (
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, SKU, or barcode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
        />
        <button
          onClick={() => setCameraOpen(true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-emerald-600 transition-colors"
          title="Scan barcode"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12 text-slate-300" />}
          title={search.trim() ? 'No products match your search' : 'No products yet'}
          description={search.trim() ? 'Try a different search term.' : 'Create your first product to get started.'}
          action={permissions?.can('create', 'products') && !search.trim() ? {
            label: 'Add Product',
            onClick: () => { setEditing(null); setFormOpen(true); }
          } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Details</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Barcode</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Stock</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Units/Box</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Shelf Life</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map(p => {
                const stock = stockLevels[p.id] ?? 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Product Details */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{p.name}</p>
                          {p.category && <p className="text-xs text-slate-400">{p.category}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-slate-700">{p.sku || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-500">{p.barcode || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        {stock}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{p.units_per_box || 1}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{p.shelf_life_days ? `${p.shelf_life_days}d` : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(permissions?.can('update', 'products') ?? true) && (
                          <button onClick={() => handleEditClick(p)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-600 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {(permissions?.can('delete', 'products') ?? true) && (
                          <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {cameraOpen && (
        <CameraScanner
          onScan={(code) => { setSearch(code); setCameraOpen(false); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}