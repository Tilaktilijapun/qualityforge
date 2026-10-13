-- Up Migration
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  category    text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  stock       integer NOT NULL CHECK (stock >= 0),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category);

CREATE TABLE cart_items (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity   integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  status           text NOT NULL CHECK (status IN ('paid', 'payment_failed', 'cancelled', 'refunded')),
  subtotal_cents   integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents   integer NOT NULL CHECK (discount_cents >= 0),
  total_cents      integer NOT NULL CHECK (total_cents >= 0),
  idempotency_key  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_idem_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);

CREATE TABLE order_items (
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id),
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  PRIMARY KEY (order_id, product_id)
);

-- Down Migration
DROP TABLE order_items;
DROP TABLE orders;
DROP TABLE cart_items;
DROP TABLE products;
DROP TABLE users;
