# QualityForge Tests

| Level | Folder | Needs DB | What it proves |
|---|---|---|---|
| Unit | `tests/unit` | No | Pricing/discount math, order state machine, error-handler mapping |
| Integration | `tests/integration` | Yes | Transactions, rollback, idempotency and concurrency at the service layer; DB constraints |
| API | `tests/api` | Yes | HTTP contract, validation, auth, authorization, error shape |

UI (Playwright) and performance (k6) arrive in later phases.

## Run
```bash
docker compose up -d db          # Postgres (creates qualityforge_test on first start)
npm install
npm test                         # unit, then integration + API
npm run test:unit                # fast, no DB
npm run test:integration
npm run test:api
```
Override the database with `TEST_DATABASE_URL`. The suite **refuses to run** unless the database name ends in `_test`, because every test starts with a `TRUNCATE`.

## How isolation works
- `tests/setup/global-setup.ts` migrates the test DB once per run.
- `tests/setup/db-setup.ts` truncates all tables before **every** test.
- DB-backed files run one at a time (they share one database); unit tests run in parallel.
- `test-data/factories.ts` creates uniquely named users/products per test — no shared accounts.
- Factories insert directly via SQL where needed, so tests can build states the API would refuse (e.g. cart quantity above stock).

## Prove the tests can fail
A passing suite only means something if it fails when the code is wrong. Apply each mutation to `app/backend/src`, run the named test, confirm it goes red, then revert. Record the result in `bug-reports/` as evidence.

| Mutation | Expected failing test |
|---|---|
| In `pricing.ts`, change `>= DISCOUNT_THRESHOLD_CENTS` to `>` | `pricing.test.ts` → "gives 10% off exactly at the threshold" |
| In `orders.service.ts`, remove `AND stock >= $2` from the checkout `UPDATE` | `checkout.int.test.ts` → "lets only one of two users buy the last unit" |
| In `orders.service.ts`, delete the `SELECT ... FOR UPDATE` on `users` | `checkout.int.test.ts` → concurrent same-key and double-spend tests |
| In `admin.routes.ts`, remove `requireRole('admin')` | `authz.api.test.ts` → "→ 403 for a customer" (all six) |
| In `orders.service.ts`, skip the stock restore in `transitionOrder` | `order-lifecycle.int.test.ts` and `orders.api.test.ts` cancel/refund tests |
