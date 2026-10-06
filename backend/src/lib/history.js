import { createHash } from 'node:crypto';
import { db, one, all } from '../db.js';

const GENESIS = '0'.repeat(64);

function digest(prev, e) {
  return createHash('sha256')
    .update([prev, e.item_id, e.type, e.actor_id ?? '', e.data, e.created_at].join('|'))
    .digest('hex');
}

/**
 * Agrega un evento a la cadena inmutable. Cada evento incluye el hash del anterior,
 * así que cualquier alteración posterior rompe la cadena y es detectable.
 * Además, triggers de SQLite impiden UPDATE/DELETE sobre la tabla.
 */
export function record(itemId, type, actorId = null, data = {}, createdAt = null) {
  const prev = one('SELECT hash FROM events ORDER BY id DESC LIMIT 1')?.hash ?? GENESIS;
  const e = {
    item_id: itemId,
    type,
    actor_id: actorId,
    data: JSON.stringify(data),
    created_at: createdAt ?? new Date().toISOString(),
  };
  const hash = digest(prev, e);
  db.prepare(
    'INSERT INTO events (item_id, type, actor_id, data, created_at, prev_hash, hash) VALUES (?,?,?,?,?,?,?)'
  ).run(e.item_id, e.type, e.actor_id, e.data, e.created_at, prev, hash);
  return hash;
}

export function itemHistory(itemId) {
  return all(
    `SELECT e.id, e.type, e.data, e.created_at, e.hash, e.prev_hash, u.alias AS actor_alias, u.role AS actor_role
     FROM events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.item_id = ? ORDER BY e.id`,
    itemId
  ).map((e) => ({ ...e, data: JSON.parse(e.data) }));
}

/** Recalcula toda la cadena y reporta el primer eslabón roto (si lo hay). */
export function verifyChain() {
  let prev = GENESIS;
  let count = 0;
  for (const e of db.prepare('SELECT * FROM events ORDER BY id').iterate()) {
    if (e.prev_hash !== prev || digest(prev, e) !== e.hash) {
      return { ok: false, count, brokenAt: e.id };
    }
    prev = e.hash;
    count++;
  }
  return { ok: true, count, head: prev };
}
