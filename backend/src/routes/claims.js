import { Router } from 'express';
import { all, one, run, tx } from '../db.js';
import { HttpError, h, requireAuth, requireVerified } from '../middleware/auth.js';
import { CLAIMABLE, ZONES, zoneLabel } from '../lib/domain.js';
import { ITEM_SELECT, serializeItem, isStaff } from '../lib/serialize.js';
import { record } from '../lib/history.js';
import { notify, notifyStaff } from '../lib/notify.js';
import { emit } from '../lib/realtime.js';
import { redact } from '../lib/privacy.js';
import { handoverToken, verifyHandoverToken } from '../lib/tokens.js';

const router = Router();
const CHAT_DAYS = 7;

const getClaim = (id) => one('SELECT * FROM claims WHERE id = ?', id);
const getItem = (id) => one(`${ITEM_SELECT} WHERE i.id = ?`, id);

/** Puede decidir: quien encontró el objeto, o el personal si está en la oficina (HU-05 CA2). */
const canDecide = (user, item) => item.user_id === user.id || (isStaff(user) && item.custody_mode === 'office');

function participants(claim, item) {
  const ids = new Set([claim.claimant_id, item.user_id]);
  if (item.custody_mode === 'office') for (const { id } of all("SELECT id FROM users WHERE role IN ('admin','security')")) ids.add(id);
  return ids;
}

function chatState(claim) {
  if (claim.status === 'delivered') return { open: false, reason: 'El objeto ya fue entregado. La sala se cerró.' };
  if (claim.status !== 'approved') return { open: false, reason: 'La sala se habilita cuando se aprueba la verificación.' };
  if (claim.chat_expires && new Date(claim.chat_expires) < new Date()) return { open: false, reason: 'La sala temporal expiró.' };
  return { open: true };
}

function serializeClaim(c, viewer) {
  const item = getItem(c.item_id);
  const claimant = one('SELECT alias FROM users WHERE id = ?', c.claimant_id);
  const role = c.claimant_id === viewer.id ? 'claimant' : item.user_id === viewer.id ? 'finder' : 'custodian';
  return {
    id: c.id,
    status: c.status,
    answer: role === 'claimant' || canDecide(viewer, item) ? c.answer : undefined,
    createdAt: c.created_at,
    decidedAt: c.decided_at,
    chatExpires: c.chat_expires,
    chat: chatState(c),
    role,
    claimantAlias: claimant?.alias,
    finderAlias: item.custody_mode === 'office' ? 'Oficina de Objetos Perdidos' : item.reporter_alias,
    canDecide: canDecide(viewer, item) && c.status === 'pending',
    item: serializeItem(item, viewer),
  };
}

// HU-05: el reclamante responde la pregunta de seguridad
router.post('/', requireVerified, h((req, res) => {
  const item = getItem(Number(req.body.itemId));
  if (!item || item.kind !== 'found') throw new HttpError(404, 'Objeto no encontrado.');
  if (item.user_id === req.user.id) throw new HttpError(400, 'No puedes reclamar un objeto que tú reportaste.');
  if (!CLAIMABLE.includes(item.status)) throw new HttpError(400, 'Este objeto ya no está disponible para reclamar.');
  const answer = String(req.body.answer || '').trim();
  if (answer.length < 2) throw new HttpError(400, 'Escribe tu respuesta.', { field: 'answer' });
  const pending = one("SELECT id FROM claims WHERE item_id = ? AND claimant_id = ? AND status IN ('pending','approved')", item.id, req.user.id);
  if (pending) throw new HttpError(409, 'Ya tienes una solicitud en curso para este objeto.');
  const recentRejections = one("SELECT COUNT(*) AS n FROM claims WHERE item_id = ? AND claimant_id = ? AND status = 'rejected'", item.id, req.user.id).n;
  if (recentRejections >= 2) throw new HttpError(429, 'Alcanzaste el máximo de intentos para este objeto. Acércate a la oficina.');

  let lostId = Number(req.body.lostId) || null;
  if (lostId && !one("SELECT id FROM items WHERE id = ? AND user_id = ? AND kind = 'lost'", lostId, req.user.id)) lostId = null;

  const claimId = tx(() => {
    const { lastInsertRowid } = run('INSERT INTO claims (item_id, claimant_id, lost_id, answer) VALUES (?,?,?,?)',
      item.id, req.user.id, lostId, answer.slice(0, 300));
    record(item.id, 'reclamo_recibido', req.user.id, { claimId: Number(lastInsertRowid) });
    return Number(lastInsertRowid);
  });

  const payload = {
    type: 'claim',
    title: 'Alguien respondió tu pregunta de seguridad',
    body: `${req.user.alias} reclama "${item.title}" (${item.radicado}). Revisa su respuesta para aprobar o rechazar.`,
    link: `/reclamos?abrir=${claimId}`,
  };
  notify(item.user_id, payload);
  if (item.custody_mode === 'office') notifyStaff({ ...payload, email: false }, item.user_id);
  res.status(201).json({ claim: serializeClaim(getClaim(claimId), req.user) });
}));

router.get('/', requireAuth, h((req, res) => {
  const mine = all('SELECT * FROM claims WHERE claimant_id = ? ORDER BY id DESC', req.user.id);
  const toReview = isStaff(req.user)
    ? all(`SELECT c.* FROM claims c JOIN items i ON i.id = c.item_id
           WHERE (i.user_id = ? OR i.custody_mode = 'office') AND c.claimant_id != ? ORDER BY c.status = 'pending' DESC, c.id DESC LIMIT 100`, req.user.id, req.user.id)
    : all('SELECT c.* FROM claims c JOIN items i ON i.id = c.item_id WHERE i.user_id = ? ORDER BY c.status = \'pending\' DESC, c.id DESC', req.user.id);
  res.json({
    mine: mine.map((c) => serializeClaim(c, req.user)),
    toReview: toReview.map((c) => serializeClaim(c, req.user)),
  });
}));

function loadForParticipant(req) {
  const claim = getClaim(Number(req.params.id));
  if (!claim) throw new HttpError(404, 'Solicitud no encontrada.');
  const item = getItem(claim.item_id);
  if (!participants(claim, item).has(req.user.id)) throw new HttpError(403, 'No participas en esta solicitud.');
  return { claim, item };
}

router.get('/:id', requireAuth, h((req, res) => {
  const { claim } = loadForParticipant(req);
  res.json({ claim: serializeClaim(claim, req.user), safePoints: ZONES.filter((z) => z.safe).map((z) => ({ id: z.id, label: z.label })) });
}));

// HU-05 CA2: aprobación o rechazo manual
router.post('/:id/decide', requireAuth, h((req, res) => {
  const { claim, item } = loadForParticipant(req);
  if (!canDecide(req.user, item)) throw new HttpError(403, 'Solo quien encontró el objeto o el custodio puede decidir.');
  if (claim.status !== 'pending') throw new HttpError(400, 'Esta solicitud ya fue resuelta.');
  if (req.body.approve && !CLAIMABLE.includes(item.status)) throw new HttpError(400, 'El objeto ya tiene otra devolución en curso.');
  const approve = !!req.body.approve;
  const expires = new Date(Date.now() + CHAT_DAYS * 86_400_000).toISOString();
  tx(() => {
    run("UPDATE claims SET status = ?, decided_by = ?, decided_at = datetime('now'), chat_expires = ? WHERE id = ?",
      approve ? 'approved' : 'rejected', req.user.id, approve ? expires : null, claim.id);
    if (approve) run("UPDATE items SET status = 'en_devolucion', updated_at = datetime('now') WHERE id = ?", item.id);
    record(item.id, approve ? 'reclamo_aprobado' : 'reclamo_rechazado', req.user.id, { claimId: claim.id });
  });
  notify(claim.claimant_id, approve
    ? { type: 'claim', title: '¡Verificación aprobada!', body: `Tu respuesta sobre "${item.title}" fue aprobada. Ya puedes coordinar la entrega en el chat anónimo.`, link: `/chat/${claim.id}` }
    : { type: 'claim', title: 'Verificación no aprobada', body: `Tu respuesta sobre "${item.title}" no coincidió. Si crees que es un error, acércate a la oficina con tu carné.`, link: `/objetos/${item.id}` });
  for (const uid of participants(claim, item)) emit(uid, 'claim', { id: claim.id, status: approve ? 'approved' : 'rejected' });
  res.json({ claim: serializeClaim(getClaim(claim.id), req.user) });
}));

// ── HU-06: chat anónimo ─────────────────────────────────────────────────────
function aliasFor(userId, claim, item) {
  if (userId === claim.claimant_id) return { alias: one('SELECT alias FROM users WHERE id = ?', userId).alias, side: 'claimant' };
  if (userId === item.user_id && item.custody_mode !== 'office') return { alias: one('SELECT alias FROM users WHERE id = ?', userId).alias, side: 'finder' };
  return { alias: 'Oficina de Objetos Perdidos', side: 'finder' };
}

router.get('/:id/messages', requireAuth, h((req, res) => {
  const { claim, item } = loadForParticipant(req);
  if (claim.status === 'pending' || claim.status === 'rejected') throw new HttpError(403, 'La sala se habilita cuando se aprueba la verificación.');
  const rows = all('SELECT * FROM messages WHERE claim_id = ? ORDER BY id', claim.id);
  res.json({
    messages: rows.map((m) => ({ id: m.id, body: m.body, redacted: !!m.redacted, createdAt: m.created_at, mine: m.sender_id === req.user.id, ...aliasFor(m.sender_id, claim, item) })),
    chat: chatState(claim),
  });
}));

router.post('/:id/messages', requireAuth, h((req, res) => {
  const { claim, item } = loadForParticipant(req);
  const state = chatState(claim);
  if (!state.open) throw new HttpError(403, state.reason);
  const raw = String(req.body.body || '').trim().slice(0, 600);
  if (!raw) throw new HttpError(400, 'Escribe un mensaje.');
  const { text, redacted } = redact(raw);
  const { lastInsertRowid } = run('INSERT INTO messages (claim_id, sender_id, body, redacted) VALUES (?,?,?,?)', claim.id, req.user.id, text, redacted ? 1 : 0);
  const base = { id: Number(lastInsertRowid), claimId: claim.id, body: text, redacted, createdAt: new Date().toISOString(), ...aliasFor(req.user.id, claim, item) };
  for (const uid of participants(claim, item)) {
    emit(uid, 'message', { ...base, mine: uid === req.user.id });
  }
  res.status(201).json({ message: { ...base, mine: true } });
}));

router.post('/:id/typing', requireAuth, h((req, res) => {
  const { claim, item } = loadForParticipant(req);
  for (const uid of participants(claim, item)) if (uid !== req.user.id) emit(uid, 'typing', { claimId: claim.id });
  res.json({ ok: true });
}));

// ── HU-08: QR dinámico y acta digital de entrega ────────────────────────────
router.get('/:id/qr', requireAuth, h((req, res) => {
  const claim = getClaim(Number(req.params.id));
  if (!claim || claim.claimant_id !== req.user.id) throw new HttpError(404, 'Solicitud no encontrada.');
  if (claim.status !== 'approved') throw new HttpError(400, 'El QR se genera cuando tu verificación está aprobada.');
  res.json(handoverToken(claim.id));
}));

export const handoverRouter = Router();

handoverRouter.post('/redeem', requireAuth, h((req, res) => {
  const claimId = verifyHandoverToken(req.body.token);
  if (!claimId) throw new HttpError(400, 'Código QR inválido o vencido. Pide al dueño que muestre el código actualizado.');
  const claim = getClaim(claimId);
  if (!claim) throw new HttpError(404, 'Solicitud no encontrada.');
  const item = getItem(claim.item_id);
  if (!canDecide(req.user, item)) throw new HttpError(403, 'Solo el hallador o el custodio pueden liberar el objeto.');
  if (claim.status === 'delivered') throw new HttpError(409, 'Este objeto ya fue entregado.');
  if (claim.status !== 'approved') throw new HttpError(400, 'La solicitud no está aprobada.');

  const deliveredAt = new Date().toISOString();
  const hash = tx(() => {
    run("UPDATE claims SET status = 'delivered' WHERE id = ?", claim.id);
    run("UPDATE claims SET status = 'rejected', decided_at = datetime('now') WHERE item_id = ? AND id != ? AND status = 'pending'", item.id, claim.id);
    run("UPDATE items SET status = 'devuelto', updated_at = datetime('now') WHERE id = ?", item.id);
    if (claim.lost_id) {
      run("UPDATE items SET status = 'recuperado', updated_at = datetime('now') WHERE id = ? AND status = 'activo'", claim.lost_id);
      record(claim.lost_id, 'recuperado', claim.claimant_id, { foundId: item.id, radicado: item.radicado });
    }
    return record(item.id, 'devuelto', req.user.id, {
      claimId: claim.id, method: 'qr', receiver: one('SELECT alias FROM users WHERE id = ?', claim.claimant_id).alias, at: deliveredAt,
    });
  });

  const acta = {
    radicado: item.radicado,
    title: item.title,
    deliveredAt,
    receiverAlias: one('SELECT alias FROM users WHERE id = ?', claim.claimant_id).alias,
    custodian: item.custody_mode === 'office' ? 'Oficina de Objetos Perdidos' : req.user.alias,
    place: zoneLabel(item.custody_mode === 'office' ? 'oficina' : item.zone),
    hash,
  };
  notify(claim.claimant_id, { type: 'delivered', title: '¡Objeto devuelto! 🎉', body: `Recibiste "${item.title}". El acta digital quedó registrada con sello ${hash.slice(0, 12)}…`, link: `/objetos/${item.id}` });
  if (item.user_id !== req.user.id) notify(item.user_id, { type: 'delivered', title: 'Entrega confirmada', body: `"${item.title}" volvió con su dueño. ¡Gracias por tu ayuda!`, link: `/objetos/${item.id}`, email: false });
  for (const uid of participants(claim, item)) emit(uid, 'claim', { id: claim.id, status: 'delivered', acta });
  res.json({ acta });
}));

export default router;
