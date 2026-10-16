import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money, Product } from '../api';
import { useAuth } from '../auth';
import { Async, Empty, useLoad } from '../ui';

export default function Store() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const list = useLoad(() => api.products(new URLSearchParams({ q, sort, pageSize: '50' })), [q, sort]);
  const cart = useLoad(() => (user ? api.cart() : Promise.resolve(null)), [user?.id]);

  async function add(p: Product) {
    if (!user) return nav('/login');
    const current = cart.data?.items.find((i) => i.productId === p.id)?.quantity ?? 0;
    try {
      await api.setQty(p.id, current + 1);
      setMsg({ ok: true, text: `Added ${p.name} to your cart.` });
      cart.reload();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <>
      <h1>Products</h1>
      <div className="row">
        <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or description" /></label>
        <label>Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name</option><option value="price_asc">Price, low to high</option>
            <option value="price_desc">Price, high to low</option><option value="newest">Newest</option>
          </select>
        </label>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <Async s={list}>
        {({ items, total }) => items.length === 0 ? <Empty>No products match “{q}”. Try a shorter search.</Empty> : (
          <div className="card tablewrap">
            <table aria-label="Products">
              <thead><tr><th>Name</th><th>Category</th><th className="num">Price</th><th>Availability</th><th><span className="sr">Action</span></th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}<div className="muted">{p.description}</div></td>
                    <td>{p.category}</td>
                    <td className="num">{money(p.priceCents)}</td>
                    <td>{p.inStock ? <span className="ok"><span aria-hidden="true">✓ </span>In stock ({p.stock})</span> : <span className="err"><span aria-hidden="true">✕ </span>Out of stock</span>}</td>
                    <td><button className="primary" disabled={!p.inStock} onClick={() => add(p)}>Add to cart</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Showing {items.length} of {total} products.</p>
          </div>
        )}
      </Async>
    </>
  );
}
