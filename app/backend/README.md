# QualityForge Backend (Phase 1)

Express + PostgreSQL REST API. This is the **system under test**.

## Run locally
```bash
cp .env.example .env
docker compose up -d db          # Postgres 16 (also creates qualityforge_test)
npm install
npm run migrate                  # applies SQL migrations
npm run seed                     # synthetic demo users + products
npm run dev:backend              # http://localhost:4000
```
Or everything in containers: `docker compose up --build`.

Demo accounts (local only): `admin@qualityforge.test` / `AdminPass123!`, `customer@qualityforge.test` / `CustomerPass123!`

## Requirements (IDs are used for test traceability)
| ID | Rule |
|---|---|
| REQ-AUTH-1 | Registration always creates a `customer`; admins are provisioned out-of-band. Password 8–72 chars; email unique case-insensitively. |
| REQ-AUTH-2 | Login returns the same 401 for unknown email and wrong password. |
| REQ-AUTHZ-1 | All `/api/admin/*` routes require a valid token and the `admin` role (401 / 403). |
| REQ-AUTHZ-2 | A customer reading or cancelling another customer's order gets 404. |
| REQ-CAT-1 | Catalog lists active products only; supports `q`, `category`, `minPrice`, `maxPrice`, `sort`, `page`, `pageSize` (≤50). |
| REQ-CART-1 | Cart quantity is set per product, integer 1–10, never above current stock. |
| REQ-CART-2 | Subtotal ≥ $100.00 (10,000 cents) earns 10% off, rounded down to the cent. |
| REQ-CART-3 | Prices always come from the database, never from the client. |
| REQ-CHK-1 | `POST /api/orders/checkout` requires an `Idempotency-Key` header (8–100 chars). |
| REQ-CHK-2 | Repeating the same key returns the original order (200 + `Idempotent-Replay: true`); only one order and one stock deduction occur, including under concurrency. |
| REQ-CHK-3 | Stock is reserved atomically; if any line is short, nothing is committed (409 `INSUFFICIENT_STOCK`). |
| REQ-CHK-4 | `paymentOutcome: "declined"` (non-production) records a `payment_failed` order (402), leaving stock and cart unchanged. |
| REQ-ORD-1 | Allowed transitions: `paid → cancelled` (owner), `paid → refunded` (admin). Everything else is 409 `INVALID_ORDER_TRANSITION`. |
| REQ-ORD-2 | Cancellation and refund restore stock in the same transaction. |
| REQ-INV-1 | Admin stock adjustments are atomic and cannot make stock negative. |
| REQ-API-1 | Errors use `{ "error": { "code", "message", "details?" } }`; no stack traces or internals. |

## Endpoints (`/api` prefix; `/health` and `/ready` are at the root)
| Method & path | Auth |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | public / public / token |
| `GET /products`, `GET /products/:id` | public |
| `GET /cart`, `PUT /cart/items/:productId`, `DELETE /cart/items/:productId`, `DELETE /cart` | customer |
| `POST /orders/checkout`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel` | customer (admin may read any order) |
| `GET/POST /admin/products`, `PATCH /admin/products/:id`, `POST /admin/products/:id/inventory` | admin |
| `GET /admin/orders`, `POST /admin/orders/:id/refund` | admin |

## Design notes
- Plain SQL via `pg` so transaction boundaries and constraints stay visible to data-integrity tests.
- Checkout locks the user row, so concurrent checkouts for one user serialize; products are updated in sorted ID order to avoid deadlocks.
- Money is integer cents everywhere.
