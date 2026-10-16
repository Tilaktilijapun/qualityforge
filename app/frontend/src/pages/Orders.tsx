import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { Async, Empty, StatusText, useLoad } from '../ui';

export function OrdersPage() {
  const orders = useLoad(api.orders);
  return (
    <>
      <h1>My orders</h1>
      <Async s={orders}>
        {({ items }) => items.length === 0 ? <Empty>You have no orders yet. <Link to="/">Browse products</Link></Empty> : (
          <div className="card tablewrap">
            <table aria-label="My orders">
              <thead><tr><th>Order</th><th>Placed</th><th>Status</th><th className="num">Total</th></tr></thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`}>{o.id.slice(0, 8)}</Link></td>
                    <td>{new Date(o.createdAt).toLocaleString()}</td>
                    <td><StatusText status={o.status} /></td>
                    <td className="num">{money(o.totalCents)}</td>
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

export function OrderDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const order = useLoad(() => api.order(id), [id]);
  const [error, setError] = useState<string>();

  async function cancel() {
    setError(undefined);
    try { await api.cancel(id); order.reload(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <Async s={order}>
      {({ order: o }) => (
        <>
          <h1>{o.status === 'paid' ? 'Order confirmed' : 'Order details'}</h1>
          {error && <div role="alert" className="alert err">{error}</div>}
          <div className="card">
            <p>Order <code>{o.id.slice(0, 8)}</code> · <span data-testid="order-status"><StatusText status={o.status} /></span></p>
            <div className="tablewrap">
              <table aria-label="Order items">
                <thead><tr><th>Item</th><th className="num">Quantity</th><th className="num">Price</th></tr></thead>
                <tbody>{o.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td className="num">{i.quantity}</td><td className="num">{money(i.unitPriceCents)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="totals">
              <div><span>Subtotal</span><span>{money(o.subtotalCents)}</span></div>
              <div><span>Discount</span><span>−{money(o.discountCents)}</span></div>
              <div><strong>Total</strong><strong>{money(o.totalCents)}</strong></div>
            </div>
            {o.status === 'paid' && o.userId === user?.id && <button onClick={cancel}>Cancel order</button>}
          </div>
        </>
      )}
    </Async>
  );
}
