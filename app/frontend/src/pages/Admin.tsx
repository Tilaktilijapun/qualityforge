import { ChangeEvent, FormEvent, useState } from 'react';
import { api, money } from '../api';
import { Async, Empty, StatusText, useLoad } from '../ui';

export function AdminProducts() {
  const products = useLoad(api.adminProducts);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({ sku: '', name: '', category: '', price: '', stock: '' });

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try { await action(); products.reload(); } catch (e) { setError((e as Error).message); }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api.createProduct({ sku: form.sku, name: form.name, category: form.category, priceCents: Math.round(parseFloat(form.price) * 100), stock: parseInt(form.stock, 10) });
      setForm({ sku: '', name: '', category: '', price: '', stock: '' });
    });
  }
  const field = (k: keyof typeof form) => ({ value: form[k], onChange: (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }), required: true });

  return (
    <>
      <h1>Products and stock</h1>
      {error && <div role="alert" className="alert err">{error}</div>}
      <form className="card row" onSubmit={create} aria-label="Add product">
        <label>SKU<input {...field('sku')} /></label>
        <label>Name<input {...field('name')} /></label>
        <label>Category<input {...field('category')} /></label>
        <label>Price (USD)<input type="number" min="0" step="0.01" {...field('price')} style={{ width: 110 }} /></label>
        <label>Stock<input type="number" min="0" step="1" {...field('stock')} style={{ width: 90 }} /></label>
        <button className="primary">Add product</button>
      </form>
      <Async s={products}>
        {({ items }) => items.length === 0 ? <Empty>No products yet. Add the first one above.</Empty> : (
          <div className="card tablewrap">
            <table aria-label="Admin products">
              <thead><tr><th>Name</th><th>SKU</th><th className="num">Price</th><th>Visibility</th><th className="num">Stock</th><th>Adjust stock</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td>{p.sku}</td><td className="num">{money(p.priceCents)}</td>
                    <td><button onClick={() => run(() => api.patchProduct(p.id, { active: !p.active }))}>{p.active ? 'Hide product' : 'Show product'}</button></td>
                    <td className="num" data-testid="stock">{p.stock}</td>
                    <td className="row" style={{ margin: 0 }}>
                      <button aria-label={`Increase ${p.name} stock by 10`} onClick={() => run(() => api.adjustStock(p.id, 10))}>+10</button>
                      <button aria-label={`Decrease ${p.name} stock by 1`} onClick={() => run(() => api.adjustStock(p.id, -1))}>−1</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </>
  );
}

export function AdminOrders() {
  const [status, setStatus] = useState('');
  const orders = useLoad(() => api.adminOrders(status), [status]);
  const [error, setError] = useState<string>();

  async function refund(id: string) {
    setError(undefined);
    try { await api.refund(id); orders.reload(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <h1>All orders</h1>
      {error && <div role="alert" className="alert err">{error}</div>}
      <div className="row">
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option value="paid">Paid</option><option value="payment_failed">Payment failed</option>
            <option value="cancelled">Cancelled</option><option value="refunded">Refunded</option>
          </select>
        </label>
      </div>
      <Async s={orders}>
        {({ items }) => items.length === 0 ? <Empty>No orders match this filter.</Empty> : (
          <div className="card tablewrap">
            <table aria-label="All orders">
              <thead><tr><th>Order</th><th>Placed</th><th>Status</th><th className="num">Total</th><th><span className="sr">Action</span></th></tr></thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>{o.id.slice(0, 8)}</td><td>{new Date(o.createdAt).toLocaleString()}</td>
                    <td><StatusText status={o.status} /></td><td className="num">{money(o.totalCents)}</td>
                    <td>{o.status === 'paid' && <button onClick={() => refund(o.id)}>Refund order</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </>
  );
}
