import { Router } from 'express';
import { all, one, run, tx } from '../db.js';
import { HttpError, h, requireAuth, requireStaff, requireVerified } from '../middleware/auth.js';
import { ITEM_SELECT, serializeItem } from '../lib/serialize.js';
import { notify } from '../lib/notify.js';
import { emit } from '../lib/realtime.js';
import { rewardToken, verifyRewardToken } from '../lib/tokens.js';
import {
  LEVELS, BENEFITS, benefitById, benefitState, couponCode, expireCoupons, levelFor, pointsOf,
  rewardSummary, serializeCoupon, pendingReceptions, awardDelivery, notifyAward,
} from '../lib/rewards.js';

const router = Router();
const DAY = 86_400_000;
const getItem = (id) => one(`${ITEM_SELECT} WHERE i.id = ?`, id);

router.get('/levels', (_req, res) => res.json({ levels: LEVELS, benefits: BENEFITS }));

// HU-18 CA2 / HU-19: saldo, nivel, beneficios e historial del Cazador
router.get('/me', requireAuth, h((req, res) => {
  res.json(rewardSummary(req.user.id));
}));

// ── HU-18 CA1: el personal confirma la recepción física y se otorgan los puntos ──
router.get('/receptions', requireStaff, h((req, res) => {
  const items = pendingReceptions().map((id) => serializeItem(getItem(id), req.user));
  res.json({ items });
}));

router.post('/receptions/:itemId', requireStaff, h((req, res) => {
  const item = getItem(Number(req.params.itemId));
  if (!item || item.kind !== 'found') throw new HttpError(404, 'Objeto no encontrado.');
  if (item.custody_mode !== 'office') throw new HttpError(400, 'El objeto aún no ha sido entregado en la oficina. Regístralo con “Recibir en oficina”.');
  if (!pendingReceptions().includes(item.id)) throw new HttpError(409, 'Esta entrega ya fue confirmada o no otorga puntos.');
  const award = tx(() => awardDelivery(item, req.user.id));
  notifyAward(award, item);
  res.json({ item: serializeItem(getItem(item.id), req.user), award });
}));

// ── HU-20: redención de beneficios con cupón y QR dinámico ──────────────────
router.post('/coupons', requireVerified, h((req, res) => {
  const benefit = benefitById(req.body.benefit);
  if (!benefit) throw new HttpError(400, 'Beneficio no válido.');
  expireCoupons();
  const level = levelFor(pointsOf(req.user.id));
  const state = benefitState(benefit, req.user.id, level);
  if (!state.unlocked) throw new HttpError(403, `Este beneficio se desbloquea en el nivel ${state.levelLabel}.`);
  if (state.activeCoupon) throw new HttpError(409, 'Ya tienes un cupón activo para este beneficio.');
  if (state.availableAt) throw new HttpError(429, 'Ya redimiste este beneficio recientemente. Podrás volver a hacerlo más adelante.', { availableAt: state.availableAt });

  const coupon = tx(() => {
    let code;
    do code = couponCode(); while (one('SELECT id FROM coupons WHERE code = ?', code));
    const expires = new Date(Date.now() + benefit.validDays * DAY).toISOString();
    const { lastInsertRowid } = run('INSERT INTO coupons (user_id, benefit, level, code, expires_at) VALUES (?,?,?,?,?)',
      req.user.id, benefit.id, level.id, code, expires);
    const id = Number(lastInsertRowid);
    run("INSERT INTO reward_transactions (user_id, type, coupon_id, note) VALUES (?, 'coupon_issued', ?, ?)",
      req.user.id, id, `Cupón generado: ${benefit.label}`);
    return one('SELECT * FROM coupons WHERE id = ?', id);
  });
  res.status(201).json({ coupon: serializeCoupon(coupon) });
}));

router.get('/coupons', requireAuth, h((req, res) => {
  expireCoupons();
  res.json({ coupons: all('SELECT * FROM coupons WHERE user_id = ? ORDER BY id DESC', req.user.id).map(serializeCoupon) });
}));

router.get('/coupons/:id/qr', requireAuth, h((req, res) => {
  expireCoupons();
  const c = one('SELECT * FROM coupons WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!c) throw new HttpError(404, 'Cupón no encontrado.');
  if (c.status !== 'active') throw new HttpError(400, c.status === 'used' ? 'Este cupón ya fue usado.' : 'Este cupón venció.');
  res.json({ ...rewardToken(c.id), coupon: serializeCoupon(c) });
}));

/** HU-20 CA2: el personal autorizado valida el QR o el código; el cupón queda usado y registrado. */
router.post('/validate', requireStaff, h((req, res) => {
  const raw = String(req.body.token || '').trim();
  expireCoupons();
  let coupon;
  if (raw.startsWith('LFR1.')) {
    const id = verifyRewardToken(raw);
    if (!id) throw new HttpError(400, 'Código QR inválido o vencido. Pide que muestren el código actualizado.');
    coupon = one('SELECT * FROM coupons WHERE id = ?', id);
  } else {
    coupon = one('SELECT * FROM coupons WHERE code = ?', raw.toUpperCase());
  }
  if (!coupon) throw new HttpError(404, 'No encontramos ese cupón.');
  if (coupon.status === 'used') throw new HttpError(409, 'Este cupón ya fue usado.', { usedAt: coupon.used_at });
  if (coupon.status !== 'active') throw new HttpError(400, 'Este cupón venció.');
  if (coupon.user_id === req.user.id) throw new HttpError(403, 'No puedes validar tus propios cupones.');

  const benefit = benefitById(coupon.benefit);
  const used = tx(() => {
    // el UPDATE condicionado impide que dos validaciones simultáneas usen el mismo cupón
    const { changes } = run("UPDATE coupons SET status = 'used', used_at = ?, used_by = ? WHERE id = ? AND status = 'active'",
      new Date().toISOString(), req.user.id, coupon.id);
    if (!changes) throw new HttpError(409, 'Este cupón ya fue usado.');
    run("INSERT INTO reward_transactions (user_id, type, coupon_id, actor_id, note) VALUES (?, 'coupon_used', ?, ?, ?)",
      coupon.user_id, coupon.id, req.user.id, `Cupón redimido: ${benefit.label}`);
    return one('SELECT * FROM coupons WHERE id = ?', coupon.id);
  });
  const owner = one('SELECT alias FROM users WHERE id = ?', coupon.user_id);
  notify(coupon.user_id, { type: 'reward', title: 'Beneficio redimido', body: `Usaste tu cupón "${benefit.label}" (${coupon.code}).`, link: '/cazadores', email: false });
  emit(coupon.user_id, 'coupon', { id: coupon.id, status: 'used' });
  res.json({ coupon: { ...serializeCoupon(used), ownerAlias: owner?.alias } });
}));

export default router;
