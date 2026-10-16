import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, money } from '../api';
import { Async, Empty, useLoad } from '../ui';

export default function CartPage() {
  const nav = useNavigate();
  const cart = useLoad(api.cart);
  const [outcome, setOutcome] = useState<'success' | 'declined'>('success');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // One key per checkout attempt: a double-click or retry replays the same order instead of duplicating it.
  const key = useRef(crypto.randomUUID());

  async function change(productId: string, quantity: number | null) {
    setError(undefined);
    try { await (quantity === null ? api.removeItem(productId) : api.setQty(productId, quantity)); } catch (e) { setError((e as Error).message); }
    cart.reload();
  }

  async function placeOrder() {
    setBusy(true); setError(undefined);
    try {
      const r = await api.checkout(key.current, outcome);
      key.current = crypto.randomUUID();
      nav(`/orders/${r.order.id}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'PAYMENT_DECLINED') {
        key.current = crypto.randomUUID(); // a declined attempt is recorded; the next try is a new attempt
        setError('Payment was declined. Your cart is unchanged. Try again or choose a different test outcome.');
      } else setError(err.message);
      cart.reload();
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Cart</h1>
      {error && <div role="alert" className="alert err">{error}</div>}
      <Async s={cart}>
        {(c) => c.items.length === 0 ? <Empty>Your cart is empty. <Link to="/">Browse products</Link></Empty> : (
          <div className="card">
            <div className="tablewrap">
              <table aria-label="Cart items">
                <thead><tr><th>Item</th><th className="num">Price</th><th>Quantity</th><th className="num">Line total</th><th><span className="sr">Remove</span></th></tr></thead>
                <tbody>
                  {c.items.map((i) => (
                    <tr key={i.productId}>
                      <td>{i.name}{!i.available && <div className="warn">Not enough stock for this quantity</div>}</td>
                      <td className="num">{money(i.unitPriceCents)}</td>
                      <td><input type="number" min={1} max={10} value={i.quantity} aria-label={`Quantity for ${i.name}`} style={{ width: 70 }}
                        onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 10) change(i.productId, n); }} /></td>
                      <td className="num">{money(i.lineTotalCents)}</td>
                      <td><button onClick={() => change(i.productId, null)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals">
              <div><span>Subtotal</span><span>{money(c.subtotalCents)}</span></div>
              <div><span>Discount</span><span>−{money(c.discountCents)}</span></div>
              <div><strong>Total</strong><strong>{money(c.totalCents)}</strong></div>
              <p className="muted">Orders of $100.00 or more get 10% off.</p>
            </div>
            <div className="row">
              <label>Test payment outcome
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as 'success' | 'declined')}>
                  <option value="success">Payment succeeds</option><option value="declined">Payment is declined</option>
                </select>
              </label>
              <button className="primary" onClick={placeOrder} disabled={busy || c.items.some((i) => !i.available)}>Place order</button>
            </div>
          </div>
        )}
      </Async>
    </>
  );
}
