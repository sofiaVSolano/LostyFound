import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

mkdirSync(path.dirname(config.dbFile), { recursive: true });
mkdirSync(config.uploadsDir, { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','security','admin')),
  alias TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verify_code TEXT,
  verify_expires TEXT,
  notify_push INTEGER NOT NULL DEFAULT 1,
  notify_email INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Objetos perdidos (kind='lost') y encontrados (kind='found')
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('lost','found')),
  radicado TEXT UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT,
  brand TEXT,
  description TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL,
  location_detail TEXT,
  event_at TEXT NOT NULL,
  custody_mode TEXT CHECK (custody_mode IN ('holder','office')),
  status TEXT NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]',
  visual_vec TEXT,
  security_question TEXT,
  security_detail TEXT,
  custody_at TEXT,
  material TEXT,
  recyclable INTEGER NOT NULL DEFAULT 0,
  policy_id INTEGER REFERENCES policies(id),
  policy_deadline TEXT,
  policy_alerted INTEGER NOT NULL DEFAULT 0,
  overdue_alerted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_kind_status ON items(kind, status);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lost_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  found_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  visual REAL NOT NULL,
  text REAL NOT NULL,
  attr REAL NOT NULL,
  common TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lost_id, found_id)
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  claimant_id INTEGER NOT NULL REFERENCES users(id),
  lost_id INTEGER REFERENCES items(id),
  answer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','delivered')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  chat_expires TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL REFERENCES claims(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  redacted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bandeja de salida de correo (si no hay SMTP configurado sirve como buzón de desarrollo)
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Historial inmutable: cadena de hashes + triggers que impiden editar o borrar (HU-08, HU-13, HU-15, HU-17)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  type TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'El historial es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'El historial es inmutable'); END;

-- HU-12: políticas de vencimiento
CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  days INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

-- HU-14: empresas de reciclaje vinculadas
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nit TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  materials TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- HU-15 / HU-17: asignaciones y disposición final
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  assigned_by INTEGER REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  disposed_at TEXT,
  disposition TEXT,
  certificate TEXT,
  notes TEXT
);

-- HU-18 a HU-20: Cazadores de Objetos. Libro de transacciones de puntos y cupones.
-- type: 'earn' (entrega confirmada en custodia), 'coupon_issued', 'coupon_used'
CREATE TABLE IF NOT EXISTS reward_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('earn','coupon_issued','coupon_used')),
  points INTEGER NOT NULL DEFAULT 0,
  item_id INTEGER REFERENCES items(id),
  coupon_id INTEGER REFERENCES coupons(id),
  actor_id INTEGER REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Un objeto solo puede otorgar puntos una vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_earn_item ON reward_transactions(item_id) WHERE type = 'earn';
CREATE INDEX IF NOT EXISTS idx_rewards_user ON reward_transactions(user_id);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  benefit TEXT NOT NULL,
  level TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by INTEGER REFERENCES users(id)
);
`);

/** Ejecuta fn dentro de una transacción. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const one = (sql, ...params) => db.prepare(sql).get(...params);
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);
