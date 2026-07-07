import { useEffect, useState, useCallback } from 'react';
import { supabase, type Order, type Customer, type OrderLine, type Product } from '../api/client';
import { LoadingState, ErrorState, Badge } from '../components/ui';
import { Package, ArrowLeft, Download, FileText, User, Calendar } from 'lucide-react';
import { generateInvoicePDF } from '../utils/pdfGenerator';

const statusColors: Record<string, 'amber' | 'blue' | 'green' | 'red'> = {
  pending: 'amber',
  ready_to_pick: 'blue',
  partially_fulfilled: 'blue',
  dispatched: 'green',
  cancelled: 'red',
};

type FullOrderLine = OrderLine & { product?: Product };

export function OrderDetailsPage({ orderId, onBack }: { orderId: string, onBack: () => void }) {
  const [order, setOrder] = useState<Order & { customer?: Customer } | null>(null);
  const [lines, setLines] = useState<FullOrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch order
      const ordRes = await supabase.from('orders').eq('id', orderId).single();
      if (ordRes.error) throw ordRes.error;
      const orderData = ordRes.data as Order;

      // 2. Fetch customer
      let customerData: Customer | undefined;
      if (orderData.customer_id) {
        const custRes = await supabase.from('customers').eq('id', orderData.customer_id).single();
        if (!custRes.error) customerData = custRes.data as Customer;
      }

      // 3. Fetch order lines
      const linesRes = await supabase.from('order_lines').eq('order_id', orderId);
      if (linesRes.error) throw linesRes.error;
      const linesData = (linesRes.data ?? []) as OrderLine[];

      // 4. Fetch products for lines
      const prodRes = await supabase.from('products').select('*');
      const products = (prodRes.data ?? []) as Product[];
      const prodMap = new Map(products.map(p => [p.id, p]));

      const fullLines = linesData.map(l => ({
        ...l,
        product: prodMap.get(l.product_id)
      }));

      setOrder({ ...orderData, customer: customerData });
      setLines(fullLines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState message="Loading order details..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <ErrorState message="Order not found" onRetry={load} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={() => generateInvoicePDF(order, lines)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <Download className="h-4 w-4" />
          Download Invoice PDF
        </button>
      </div>

      <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 font-mono">{order.order_number}</h1>
                <p className="text-sm text-slate-500">
                  Placed on {new Date(order.order_date).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Badge color={statusColors[order.status] || 'amber'}>
              {order.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 p-6">
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <User className="h-4 w-4 text-slate-400" />
              Customer Information
            </h3>
            {order.customer ? (
              <div className="space-y-1">
                <p className="font-semibold text-slate-800">{order.customer.name}</p>
                <p className="text-sm text-slate-600">{order.customer.phone || 'No phone'}</p>
                <p className="text-sm text-slate-600">{order.customer.address || 'No address'}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Unknown Customer</p>
            )}
          </div>
          <div className="sm:pl-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Calendar className="h-4 w-4 text-slate-400" />
              Order Timeline
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Ordered</span>
                <span className="font-medium text-slate-900">{new Date(order.order_date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dispatched</span>
                <span className="font-medium text-slate-900">
                  {order.dispatched_at ? new Date(order.dispatched_at).toLocaleString() : 'Not dispatched yet'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-bold text-slate-900 flex items-center gap-2">
        <Package className="h-5 w-5 text-brand-500" />
        Order Lines
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-slate-500">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
            <tr>
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">SKU</th>
              <th className="px-6 py-4 text-right">Boxes</th>
              <th className="px-6 py-4 text-right">Total Units</th>
              <th className="px-6 py-4 text-right">Fulfilled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-900">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-semibold text-slate-800">
                  {line.product?.name || 'Unknown Product'}
                </td>
                <td className="px-6 py-4 font-mono text-slate-500">
                  {line.product?.sku || 'N/A'}
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {line.quantity_boxes}
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {line.quantity_units}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`font-bold ${line.quantity_fulfilled_units >= line.quantity_units ? 'text-green-600' : 'text-amber-600'}`}>
                    {line.quantity_fulfilled_units}
                  </span>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No products in this order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
