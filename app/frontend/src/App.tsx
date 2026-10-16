import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { AdminOrders, AdminProducts } from './pages/Admin';
import Auth from './pages/Auth';
import CartPage from './pages/Cart';
import { OrderDetail, OrdersPage } from './pages/Orders';
import Overview from './pages/Overview';
import Store from './pages/Store';

function Layout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>QualityForge</Link>
        <div className="row" style={{ margin: 0, alignItems: 'center' }}>
          {user ? (
            <>
              <span className="muted">{user.email}</span>
              <button onClick={() => { signOut(); nav('/'); }}>Sign out</button>
            </>
          ) : (
            <><NavLink to="/login">Sign in</NavLink><NavLink to="/register">Create account</NavLink></>
          )}
        </div>
      </header>
      <nav className="side" aria-label="Main">
        <h2>Shop</h2>
        <NavLink to="/" end>Products</NavLink>
        {user && <><NavLink to="/cart">Cart</NavLink><NavLink to="/orders">My orders</NavLink></>}
        {user?.role === 'admin' && (
          <><h2>Admin</h2><NavLink to="/admin/products">Products and stock</NavLink><NavLink to="/admin/orders">All orders</NavLink></>
        )}
        <h2>Quality</h2>
        <NavLink to="/quality">Overview</NavLink>
      </nav>
      <main><Outlet /></main>
    </div>
  );
}

function RequireAuth() {
  const { user, ready } = useAuth();
  if (!ready) return <p className="muted" aria-busy="true">Loading…</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireAdmin() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <div role="alert" className="alert err"><h1>Admin access required</h1><p>Your account cannot open this page.</p></div>;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Store />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="quality" element={<Overview />} />
        <Route element={<RequireAuth />}>
          <Route path="cart" element={<CartPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin/products" element={<AdminProducts />} />
            <Route path="admin/orders" element={<AdminOrders />} />
          </Route>
        </Route>
        <Route path="*" element={<h1>Page not found</h1>} />
      </Route>
    </Routes>
  );
}
