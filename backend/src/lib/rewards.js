import { randomInt } from 'node:crypto';
import { all, one, run } from '../db.js';
import { config } from '../config.js';
import { record } from './history.js';
import { notify } from './notify.js';

// HU-19: niveles de Cazador. Los beneficios son acumulativos: cada nivel incluye los anteriores.
export const LEVELS = [
  { id: 'basico', label: 'Básico', min: 0, max: 9, benefits: ['seguro'] },
  { id: 'intermedio', label: 'Intermedio', min: 10, max: 20, benefits: ['seguro', 'alimentos'] },
  { id: 'golden', label: 'Golden', min: 21, max: null, benefits: ['seguro', 'alimentos', 'impresiones'] },
];

// HU-20: beneficios institucionales redimibles. cooldownDays evita redenciones repetidas del mismo beneficio.
export const BENEFITS = [
  { id: 'seguro', label: 'Seguro estudiantil mejorado', detail: 'Activa la cobertura ampliada del seguro estudiantil en Bienestar Universitario.', level: 'basico', place: 'Bienestar Universitario', validDays: 7, cooldownDays: 180 },
  { id: 'alimentos', label: '15 % de descuento en alimentos', detail: 'Descuento en una compra en la tienda de alimentos del campus.', level: 'intermedio', place: 'Tienda de alimentos del campus', validDays: 2, cooldownDays: 7 },
  { id: 'impresiones', label: '20 impresiones gratuitas', detail: 'Impresiones en blanco y negro en el centro de copiado.', level: 'golden', place: 'Centro de copiado', validDays: 7, cooldownDays: 7 },
];

const DAY = 86_400_000;
export const benefitById = (id) => BENEFITS.find((b) => b.id === id);
export const levelFor = (points) => [...LEVELS].reverse().find((l) => points >= l.min);

export const pointsOf = (userId) =>
  one("SELECT COALESCE(SUM(points), 0) AS p FROM reward_transactions WHERE user_id = ? AND type = 'earn'", userId).p;

/** HU-18: objetos sin dueño entregados en la oficina por la comunidad que aún esperan la confirmación del personal. */
export function pendingReceptions() {
  return all(
    `SELECT i.id FROM items i JOIN users u ON u.id = i.user_id
     WHERE i.kind = 'found' AND i.custody_mode = 'office' AND u.role = 'user'
       AND NOT EXISTS (SELECT 1 FROM reward_transactions t WHERE t.item_id = i.id AND t.type = 'earn')
     ORDER BY i.custody_at ASC`
  ).map((r) => r.id);
}

export const isRewarded = (itemId) => !!one("SELECT id FROM reward_transactions WHERE item_id = ? AND type = 'earn'", itemId);

/**
 * HU-18 CA1: otorga puntos a quien entregó el objeto una vez que el personal confirma la recepción física.
 * Solo una vez por objeto (índice único) y nunca al personal. Debe llamarse dentro de una transacción.
 */
export function awardDelivery(item, staffId, createdAt = null) {
  const reporter = one('SELECT id, role FROM users WHERE id = ?', item.user_id);
  if (!reporter || reporter.role !== 'user' || reporter.id === staffId || isRewarded(item.id)) return null;
  const before = pointsOf(reporter.id);
  const points = config.pointsPerDelivery;
  run(
    "INSERT INTO reward_transactions (user_id, type, points, item_id, actor_id, note, created_at) VALUES (?, 'earn', ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    reporter.id, points, item.id, staffId, `Entrega de "${item.title}" (${item.radicado})`, createdAt
  );
  record(item.id, 'puntos_otorgados', staffId, { points }, createdAt);
  const from = levelFor(before);
  const to = levelFor(before + points);
  return { userId: reporter.id, points, total: before + points, levelUp: from.id !== to.id ? to : null };
}

/** Avisa al Cazador de sus puntos (fuera de la transacción). */
export function notifyAward(award, item) {
  if (!award) return;
  notify(award.userId, {
    type: 'reward',
    title: `¡Sumaste ${award.points} puntos de Cazador!`,
    body: `La oficina confirmó la recepción de "${item.title}". Ahora tienes ${award.total} puntos.`,
    link: '/cazadores',
    email: false,
  });
  if (award.levelUp) {
    notify(award.userId, {
      type: 'reward',
      title: `Subiste a Cazador ${award.levelUp.label} 🏅`,
      body: `Desbloqueaste nuevos beneficios: ${award.levelUp.benefits.map((b) => benefitById(b).label).join(', ')}.`,
      link: '/cazadores',
    });
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function couponCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return `CZ-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Marca como vencidos los cupones cuya vigencia ya pasó. */
export function expireCoupons(now = new Date()) {
  run("UPDATE coupons SET status = 'expired' WHERE status = 'active' AND expires_at <= ?", now.toISOString());
}

/** Estado de un beneficio para un usuario: bloqueado, disponible, con cupón activo o en espera. */
export function benefitState(benefit, userId, level, now = Date.now()) {
  const unlocked = level.benefits.includes(benefit.id);
  const active = one("SELECT * FROM coupons WHERE user_id = ? AND benefit = ? AND status = 'active' ORDER BY id DESC LIMIT 1", userId, benefit.id);
  const lastUsed = one("SELECT used_at FROM coupons WHERE user_id = ? AND benefit = ? AND status = 'used' ORDER BY used_at DESC LIMIT 1", userId, benefit.id);
  const nextAt = lastUsed ? new Date(new Date(lastUsed.used_at).getTime() + benefit.cooldownDays * DAY) : null;
  const waiting = nextAt && nextAt > now;
  return {
    ...benefit,
    levelLabel: LEVELS.find((l) => l.id === benefit.level).label,
    unlocked,
    activeCoupon: active ? serializeCoupon(active) : null,
    availableAt: waiting ? nextAt.toISOString() : null,
    canRedeem: unlocked && !active && !waiting,
  };
}

export function serializeCoupon(c) {
  const b = benefitById(c.benefit);
  return {
    id: c.id, benefit: c.benefit, benefitLabel: b?.label ?? c.benefit, place: b?.place, level: c.level,
    code: c.code, status: c.status, createdAt: c.created_at, expiresAt: c.expires_at, usedAt: c.used_at,
  };
}

export function rewardSummary(userId) {
  expireCoupons();
  const points = pointsOf(userId);
  const level = levelFor(points);
  const next = LEVELS.find((l) => l.min > points) ?? null;
  const history = all(
    `SELECT t.id, t.type, t.points, t.note, t.created_at, t.item_id, c.code, c.benefit
     FROM reward_transactions t LEFT JOIN coupons c ON c.id = t.coupon_id
     WHERE t.user_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 100`, userId);
  return {
    points,
    deliveries: one("SELECT COUNT(*) AS n FROM reward_transactions WHERE user_id = ? AND type = 'earn'", userId).n,
    pointsPerDelivery: config.pointsPerDelivery,
    level: { id: level.id, label: level.label, min: level.min, max: level.max },
    next: next ? { id: next.id, label: next.label, min: next.min, missing: next.min - points } : null,
    levels: LEVELS,
    benefits: BENEFITS.map((b) => benefitState(b, userId, level)),
    history,
  };
}
