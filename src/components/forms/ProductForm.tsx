import { useState } from 'react';
import { supabase, type Product } from '../../api/client';
import { Spinner } from '../ui';

type Props = {
  product: Product | null;
  onSaved: () => void;
  onCancel: () => void;
};

export function ProductForm({ product, onSaved, onCancel }: Props) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    units_per_box: product?.units_per_box?.toString() ?? '',
    shelf_life_days: product?.shelf_life_days?.toString() ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || null,
        units_per_box: form.units_per_box ? parseInt(form.units_per_box) : null,
        shelf_life_days: form.shelf_life_days ? parseInt(form.shelf_life_days) : null,
        is_active: product ? product.is_active : 1,
      };

      if (product) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Product Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">SKU Code</label>
          <input
            type="text"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            required
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Barcode</label>
          <input
            type="text"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Units Per Box</label>
          <input
            type="number"
            value={form.units_per_box}
            onChange={(e) => setForm({ ...form, units_per_box: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
            placeholder="Shelf Life config..."
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Shelf Life (Days)</label>
          <input
            type="number"
            value={form.shelf_life_days}
            onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
            placeholder="Days..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {saving && <Spinner className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </form>
  );
}
