/** Synthetic demo data only. Credentials below are for local development — never reuse them anywhere real. */
import bcrypt from 'bcryptjs';
import { config } from './config';
import { pool } from './db';

const USERS = [
  { email: 'admin@qualityforge.test', password: 'AdminPass123!', role: 'admin' },
  { email: 'customer@qualityforge.test', password: 'CustomerPass123!', role: 'customer' },
];

const PRODUCTS: [string, string, string, string, number, number][] = [
  ['KB-001', 'Mechanical Keyboard', 'Tenkeyless, tactile switches', 'Peripherals', 8900, 40],
  ['MS-001', 'Wireless Mouse', 'Ergonomic, 2.4 GHz', 'Peripherals', 2900, 80],
  ['MN-001', '27" Monitor', 'QHD IPS panel', 'Displays', 27900, 15],
  ['MN-002', '24" Monitor', 'Full HD IPS panel', 'Displays', 15900, 25],
  ['HD-001', 'Noise-Cancelling Headphones', 'Over-ear, 30h battery', 'Audio', 19900, 30],
  ['HD-002', 'Wired Earbuds', 'In-ear with microphone', 'Audio', 1500, 200],
  ['WC-001', 'HD Webcam', '1080p with privacy shutter', 'Peripherals', 5900, 50],
  ['DK-001', 'USB-C Dock', '8-in-1 with HDMI and Ethernet', 'Accessories', 7900, 35],
  ['CB-001', 'USB-C Cable 1m', 'Braided, 100W', 'Accessories', 1200, 300],
  ['ST-001', 'Laptop Stand', 'Adjustable aluminium', 'Accessories', 3500, 60],
  ['LP-001', 'Desk Lamp', 'LED, dimmable', 'Office', 4500, 0], // deliberately out of stock
  ['CH-001', 'Ergonomic Chair', 'Mesh back, lumbar support', 'Office', 24900, 10],
];

async function main() {
  for (const u of USERS) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3)
       ON CONFLICT (lower(email)) DO NOTHING`,
      [u.email, await bcrypt.hash(u.password, config.bcryptCost), u.role],
    );
  }
  for (const [sku, name, description, category, price, stock] of PRODUCTS) {
    await pool.query(
      `INSERT INTO products (sku, name, description, category, price_cents, stock)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO NOTHING`,
      [sku, name, description, category, price, stock],
    );
  }
  console.log(`Seeded ${USERS.length} users and ${PRODUCTS.length} products (existing rows left untouched).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
