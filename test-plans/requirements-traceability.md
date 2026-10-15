# Requirements Traceability (Phase 2)

Requirement IDs are defined in `app/backend/README.md`. "Partial" means the rule has automated coverage but known gaps remain.

| Requirement | Automated coverage | Status |
|---|---|---|
| REQ-AUTH-1 registration creates customer | `auth.api` (register, role ignored, duplicates, validation) | Covered |
| REQ-AUTH-2 identical login failure | `auth.api` (wrong password vs unknown email) | Covered |
| REQ-AUTHZ-1 admin routes need admin role | `authz.api` (6 routes × 401/403), `admin-products.api` | Covered |
| REQ-AUTHZ-2 no cross-customer order access | `authz.api`, `order-lifecycle.int` | Covered |
| REQ-CAT-1 catalog search/filter/sort/pagination | `catalog.api` | Covered |
| REQ-CART-1 quantity rules | `pricing.test`, `cart.api`, `db-constraints.int` | Covered |
| REQ-CART-2 discount rule | `pricing.test`, `cart.api`, `checkout.int` | Covered |
| REQ-CART-3 server-side pricing | `cart.api` (client price rejected), `checkout.int` (price snapshot) | Covered |
| REQ-CHK-1 idempotency key required | `checkout.api` | Covered |
| REQ-CHK-2 idempotent replay incl. concurrency | `checkout.int`, `checkout.api`, `db-constraints.int` | Covered |
| REQ-CHK-3 atomic stock reservation | `checkout.int` (rollback, last unit), `checkout.api` | Covered |
| REQ-CHK-4 declined payment | `checkout.int`, `checkout.api` | Covered |
| REQ-ORD-1 state transitions | `orderState.test`, `order-lifecycle.int`, `orders.api` | Covered |
| REQ-ORD-2 stock restored on cancel/refund | `order-lifecycle.int`, `orders.api` | Covered |
| REQ-INV-1 atomic non-negative adjustments | `admin-products.api` (incl. 10× concurrent) | Covered |
| REQ-API-1 error shape and no leakage | `errorHandler.test`, `platform.api` | Covered |

## Known gaps (honest list)
- Token revocation and rate limiting do not exist yet, so they are untested.
- No test yet for stock reservation across *different* users with multi-line carts under load (planned for k6 in Phase 5).
- Tests have not yet been run in CI; that arrives in Phase 4.
