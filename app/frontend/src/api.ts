/** Thin API client layer: all HTTP lives here so screens never build requests by hand. */
export interface User { id: string; email: string; role: 'customer' | 'admin' }
export interface Product { id: string; sku: string; name: string; description: string; category: string; priceCents: number; stock: number; inStock: boolean; active: boolean }
export interface CartItem { productId: string; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number; available: boolean }
export interface Cart { items: CartItem[]; subtotalCents: number; discountCents: number; totalCents: number }
export type OrderStatus = 'paid' | 'payment_failed' | 'cancelled' | 'refunded';
export interface Order { id: string; userId: string; status: OrderStatus; subtotalCents: number; discountCents: number; totalCents: number; items: { productId: string; name: string; quantity: number; unitPriceCents: number }[]; createdAt: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

const TOKEN_KEY = 'qf_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function req<T>(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? res.statusText, data?.error?.details);
  return data as T;
}

export const api = {
  login: (email: string, password: string) => req<{ user: User; token: string }>('/auth/login', 'POST', { email, password }),
  register: (email: string, password: string) => req<{ user: User; token: string }>('/auth/register', 'POST', { email, password }),
  me: () => req<{ user: User }>('/auth/me'),
  products: (qs: URLSearchParams) => req<{ items: Product[]; total: number }>(`/products?${qs}`),
  cart: () => req<Cart>('/cart'),
  setQty: (productId: string, quantity: number) => req<Cart>(`/cart/items/${productId}`, 'PUT', { quantity }),
  removeItem: (productId: string) => req<Cart>(`/cart/items/${productId}`, 'DELETE'),
  checkout: (key: string, paymentOutcome: 'success' | 'declined') => req<{ order: Order }>('/orders/checkout', 'POST', { paymentOutcome }, { 'Idempotency-Key': key }),
  orders: () => req<{ items: Order[] }>('/orders'),
  order: (id: string) => req<{ order: Order }>(`/orders/${id}`),
  cancel: (id: string) => req<{ order: Order }>(`/orders/${id}/cancel`, 'POST'),
  adminProducts: () => req<{ items: Product[] }>('/admin/products'),
  createProduct: (p: { sku: string; name: string; category: string; priceCents: number; stock: number }) => req<{ product: Product }>('/admin/products', 'POST', p),
  patchProduct: (id: string, p: Partial<Pick<Product, 'active'>>) => req<{ product: Product }>(`/admin/products/${id}`, 'PATCH', p),
  adjustStock: (id: string, delta: number) => req<{ product: Product }>(`/admin/products/${id}/inventory`, 'POST', { delta }),
  adminOrders: (status: string) => req<{ items: Order[]; total: number }>(`/admin/orders?pageSize=100${status ? `&status=${status}` : ''}`),
  refund: (id: string) => req<{ order: Order }>(`/admin/orders/${id}/refund`, 'POST'),
};
