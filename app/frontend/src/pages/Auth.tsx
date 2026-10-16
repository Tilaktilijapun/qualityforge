import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(undefined);
    try {
      const r = await (isLogin ? api.login : api.register)(email, password);
      signIn(r.token, r.user);
      nav('/');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>
      {error && <div role="alert" className="alert err">{error}</div>}
      <form className="stack" onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={isLogin ? 'current-password' : 'new-password'} /></label>
        {!isLogin && <span className="muted">Use at least 8 characters.</span>}
        <button className="primary" disabled={busy}>{isLogin ? 'Sign in' : 'Create account'}</button>
      </form>
      <p className="muted">{isLogin ? <>New here? <Link to="/register">Create an account</Link></> : <>Have an account? <Link to="/login">Sign in</Link></>}</p>
    </div>
  );
}
