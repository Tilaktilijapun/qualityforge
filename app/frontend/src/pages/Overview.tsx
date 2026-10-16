/**
 * Quality overview. Every number on this page is derived from the DEMO_* seed arrays below and is
 * labelled "Demo data". Phase 4 replaces them with real CI results — never present them as live.
 */
interface Run { id: string; branch: string; suite: string; passed: number; failed: number; skipped: number; seconds: number }
interface Defect { id: string; title: string; severity: 'critical' | 'high' | 'medium'; status: string }

const DEMO_RUNS: Run[] = [
  { id: '#128', branch: 'main', suite: 'API', passed: 62, failed: 2, skipped: 1, seconds: 74 },
  { id: '#127', branch: 'feat/checkout', suite: 'UI', passed: 17, failed: 1, skipped: 0, seconds: 142 },
  { id: '#126', branch: 'main', suite: 'Integration', passed: 24, failed: 0, skipped: 0, seconds: 51 },
  { id: '#125', branch: 'main', suite: 'Unit', passed: 41, failed: 0, skipped: 0, seconds: 6 },
];
const DEMO_DEFECTS: Defect[] = [
  { id: 'DEF-014', title: 'Duplicate order on double-submit', severity: 'critical', status: 'In review' },
  { id: 'DEF-011', title: 'Stock not restored after refund', severity: 'critical', status: 'Triaged' },
  { id: 'DEF-009', title: 'Search treats % as a wildcard', severity: 'high', status: 'Retested' },
];

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

export default function Overview() {
  const passed = DEMO_RUNS.reduce((n, r) => n + r.passed, 0);
  const total = DEMO_RUNS.reduce((n, r) => n + r.passed + r.failed + r.skipped, 0);
  const latest = DEMO_RUNS[0];
  const critical = DEMO_DEFECTS.filter((d) => d.severity === 'critical');

  return (
    <>
      <h1>Quality overview <span className="tag">Demo data</span></h1>
      <p className="muted">These figures are seeded examples, not live results. Real pipeline data arrives with the CI phase.</p>
      <section className="metrics" aria-label="Key metrics">
        <div className="card"><div className="muted">Latest pipeline</div><div className="v">{latest.failed === 0 ? <span className="ok">✓ Passed</span> : <span className="err">✕ Failed</span>}</div></div>
        <div className="card"><div className="muted">Pass rate</div><div className="v">{((passed / total) * 100).toFixed(1)}%</div></div>
        <div className="card"><div className="muted">Open critical defects</div><div className="v">{critical.length}</div></div>
        <div className="card"><div className="muted">Last run duration</div><div className="v">{fmt(latest.seconds)}</div></div>
      </section>
      <section className="card tablewrap">
        <h2>Recent test runs</h2>
        <table aria-label="Recent test runs">
          <thead><tr><th>Run</th><th>Branch</th><th>Suite</th><th>Passed / failed / skipped</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            {DEMO_RUNS.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.branch}</td><td>{r.suite}</td><td>{r.passed} / {r.failed} / {r.skipped}</td><td>{fmt(r.seconds)}</td>
                <td>{r.failed === 0 ? <span className="ok"><span aria-hidden="true">✓ </span>Passed</span> : <span className="err"><span aria-hidden="true">✕ </span>Failed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card tablewrap">
        <h2>Open critical defects</h2>
        <table aria-label="Open critical defects">
          <thead><tr><th>ID</th><th>Summary</th><th>Status</th></tr></thead>
          <tbody>{critical.map((d) => <tr key={d.id}><td>{d.id}</td><td>{d.title}</td><td>{d.status}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
