import { ReactNode, useEffect, useState } from 'react';
import type { OrderStatus } from './api';

interface LoadState<T> { data?: T; error?: string; loading: boolean }

/** Loads data with explicit loading / error / data states; `reload()` refetches. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<LoadState<T>>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => live && set({ data, loading: false })).catch((e: Error) => live && set({ error: e.message, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function Async<T>({ s, children }: { s: LoadState<T>; children: (d: T) => ReactNode }) {
  if (s.error) return <div role="alert" className="alert err">Could not load this page: {s.error}</div>;
  if (s.data === undefined) return <p className="muted" aria-busy="true">Loading…</p>;
  return <>{children(s.data)}</>;
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="muted">{children}</p>;

const STATUS: Record<OrderStatus, [string, string, string]> = {
  paid: ['ok', '✓', 'Paid'], payment_failed: ['err', '✕', 'Payment failed'],
  cancelled: ['warn', '!', 'Cancelled'], refunded: ['warn', '!', 'Refunded'],
};
/** Colour is always paired with an icon and text. */
export function StatusText({ status }: { status: OrderStatus }) {
  const [cls, icon, label] = STATUS[status];
  return <span className={cls}><span aria-hidden="true">{icon} </span>{label}</span>;
}
