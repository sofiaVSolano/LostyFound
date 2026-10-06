import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { all, one, run, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError, h, requireAuth, requireVerified } from '../middleware/auth.js';
import { CLAIMABLE, isCategory, isColor, isZone, zoneLabel, statusLabel } from '../lib/domain.js';
import { serializeItem, ITEM_SELECT, isStaff } from '../lib/serialize.js';
import { runMatching, previewMatches } from '../lib/matching/engine.js';
import { isValidVector } from '../lib/matching/visual.js';
import { record, itemHistory } from '../lib/history.js';
import { makeRadicado } from '../lib/tokens.js';
import { applyPolicy } from '../lib/custody.js';
import { notify, notifyStaff } from '../lib/notify.js';

const router = Router();

// HU-02 CA2: JPG/PNG de máximo 10 MB, hasta 3 fotos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, `"${file.originalname}" no es JPG ni PNG.`, { field: 'photos' }));
  },
});

function savePhoto(file) {
  const b = file.buffer;
  const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (!isJpg && !isPng) throw new HttpError(400, `"${file.originalname}" no parece una imagen JPG/PNG válida.`, { field: 'photos' });
  const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${isJpg ? 'jpg' : 'png'}`;
  writeFileSync(path.join(config.uploadsDir, name), b);
  return `/uploads/${name}`;
}

function parseVisual(raw, photoCount) {
  if (!raw || !photoCount) return null;
  try {
    const arr = JSON.parse(raw);
    const valid = Array.isArray(arr) ? arr.filter(isValidVector).slice(0, photoCount) : [];
    return valid.length ? JSON.stringify(valid) : null;
  } catch {
    return null;
  }
}

const getItem = (id) => one(`${ITEM_SELECT} WHERE i.id = ?`, id);

function serializeMatch(m, viewer, side) {
  const other = getItem(side === 'found' ? m.found_id : m.lost_id);
  return {
    id: m.id,
    score: m.score,
    visual: m.visual,
    text: m.text,
    attr: m.attr,
    common: JSON.parse(m.common),
    item: serializeItem(other, viewer),
  };
}

// ── Crear reporte (HU-02 perdido, HU-03 encontrado) ─────────────────────────
router.post('/', requireVerified, upload.array('photos', 3), h((req, res) => {
  const b = req.body;
  const kind = b.kind === 'found' ? 'found' : 'lost';
  const title = String(b.title || '').trim();
  const errors = {};
  if (title.length < 3) errors.title = 'Ponle un nombre corto al objeto (ej. "Audífonos inalámbricos").';
  if (!isCategory(b.category)) errors.category = 'Selecciona una categoría.';
  if (!isZone(b.zone)) errors.zone = 'Indica la zona del campus.';
  if (b.color && !isColor(b.color)) errors.color = 'Color no válido.';
  const eventAt = new Date(b.eventAt || Date.now());
  if (Number.isNaN(eventAt.getTime()) || eventAt > new Date(Date.now() + 5 * 60_000)) errors.eventAt = 'La fecha no puede estar en el futuro.';
  if (kind === 'found' && !['holder', 'office'].includes(b.custodyMode)) errors.custodyMode = 'Cuéntanos dónde está el objeto ahora.';
  if (kind === 'found' && (!req.files || req.files.length === 0)) errors.photos = 'Adjunta al menos una foto del objeto encontrado.';
  if (kind === 'found' && b.securityQuestion && String(b.securityDetail || '').trim().length < 2) {
    errors.securityDetail = 'Escribe la respuesta esperada (solo tú y la oficina la verán).';
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Revisa los campos marcados.', { fields: errors });

  const photos = (req.files || []).map(savePhoto);
  const visual = parseVisual(b.visual, photos.length);
  const now = new Date().toISOString();
  const custodyMode = kind === 'found' ? b.custodyMode : null;
  const status = kind === 'lost' ? 'activo' : custodyMode === 'office' ? 'en_custodia' : 'en_espera_entrega';

  const id = tx(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO items (kind, user_id, title, category, color, brand, description, zone, location_detail, event_at,
        custody_mode, status, photos, visual_vec, security_question, security_detail, custody_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      kind, req.user.id, title.slice(0, 80), b.category, b.color || null, String(b.brand || '').trim().slice(0, 40) || null,
      String(b.description || '').trim().slice(0, 1000), b.zone, String(b.locationDetail || '').trim().slice(0, 120) || null,
      eventAt.toISOString(), custodyMode, status, JSON.stringify(photos), visual,
      kind === 'found' ? String(b.securityQuestion || '').trim().slice(0, 160) || null : null,
      kind === 'found' ? String(b.securityDetail || '').trim().slice(0, 160) || null : null,
      custodyMode === 'office' ? now : null
    );
    const itemId = Number(lastInsertRowid);
    const radicado = makeRadicado(itemId);
    run('UPDATE items SET radicado = ? WHERE id = ?', radicado, itemId);
    record(itemId, kind === 'lost' ? 'reportado_perdido' : 'reportado_encontrado', req.user.id, {
      radicado, zone: b.zone, status,
    });
    if (custodyMode === 'office') {
      record(itemId, 'ingreso_custodia', req.user.id, { at: now });
      applyPolicy(itemId);
    }
    return itemId;
  });

  const matches = runMatching(id);
  const item = getItem(id);

  if (kind === 'found' && custodyMode === 'office' && !isStaff(req.user)) {
    notifyStaff({
      type: 'custody',
      title: 'Nuevo objeto para recibir',
      body: `${item.title} (${item.radicado}) fue reportado como entregado en la oficina/portería.`,
      link: `/objetos/${id}`,
      email: false,
    });
  }

  res.status(201).json({
    item: serializeItem(item, req.user),
    matches: matches.map((m) => ({
      score: m.score, visual: m.visual, text: m.text, attr: m.attr, common: m.common,
      item: serializeItem(getItem(kind === 'lost' ? m.found.id : m.lost.id), req.user),
    })),
  });
}));

// Vista previa de coincidencias mientras se llena el formulario (no guarda nada)
router.post('/preview', requireAuth, h((req, res) => {
  const b = req.body || {};
  if (!isCategory(b.category)) return res.json({ matches: [] });
  const visual = Array.isArray(b.visual) ? b.visual.filter(isValidVector).slice(0, 3) : null;
  const results = previewMatches({
    title: String(b.title || ''), description: String(b.description || ''), brand: b.brand || null,
    category: b.category, color: isColor(b.color) ? b.color : null, zone: isZone(b.zone) ? b.zone : 'plazoleta',
    event_at: b.eventAt, visual: visual?.length ? visual : null,
  }).filter((r) => r.found.user_id !== req.user.id);
  res.json({ matches: results.map((r) => ({ score: r.score, common: r.common, item: serializeItem(getItem(r.found.id), req.user) })) });
}));

// ── Catálogo y búsqueda manual (HU-09) ─────────────────────────────────────
function catalogFilters(q, viewer) {
  const where = [];
  const params = [];
  const kind = q.kind === 'lost' && isStaff(viewer) ? 'lost' : 'found';
  where.push('i.kind = ?'); params.push(kind);
  const statuses = String(q.status || '').split(',').filter(Boolean);
  if (statuses.length) { where.push(`i.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  else if (kind === 'found') { where.push(`i.status IN (${CLAIMABLE.map(() => '?').join(',')})`); params.push(...CLAIMABLE); }
  const cats = String(q.category || '').split(',').filter(isCategory);
  if (cats.length) { where.push(`i.category IN (${cats.map(() => '?').join(',')})`); params.push(...cats); }
  if (isZone(q.zone)) { where.push('i.zone = ?'); params.push(q.zone); }
  if (q.from) { where.push('i.event_at >= ?'); params.push(new Date(q.from).toISOString()); }
  if (q.to) { where.push('i.event_at <= ?'); params.push(new Date(new Date(q.to).getTime() + 86_399_999).toISOString()); }
  if (q.q) {
    where.push("(i.title LIKE ? OR i.description LIKE ? OR i.brand LIKE ? OR i.radicado LIKE ?)");
    const like = `%${String(q.q).trim()}%`;
    params.push(like, like, like, like);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/', requireAuth, h((req, res) => {
  const { sql, params } = catalogFilters(req.query, req.user);
  const sort = req.query.sort === 'oldest' ? 'i.event_at ASC' : 'i.event_at DESC';
  const limit = Math.min(60, Number(req.query.limit) || 24);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rows = all(`${ITEM_SELECT} ${sql} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...params, limit, offset);
  const { n } = one(`SELECT COUNT(*) AS n FROM items i ${sql}`, ...params);
  const zones = all(`SELECT i.zone, COUNT(*) AS n FROM items i ${sql} GROUP BY i.zone`, ...params);
  res.json({ items: rows.map((r) => serializeItem(r, req.user)), total: n, zones });
}));

router.get('/mine', requireAuth, h((req, res) => {
  const rows = all(`${ITEM_SELECT} WHERE i.user_id = ? ORDER BY i.created_at DESC`, req.user.id);
  const items = rows.map((r) => {
    const it = serializeItem(r, req.user);
    if (r.kind === 'lost') {
      const top = one('SELECT MAX(score) AS s, COUNT(*) AS n FROM matches m JOIN items f ON f.id = m.found_id WHERE m.lost_id = ? AND f.status IN (?,?)', r.id, ...CLAIMABLE);
      it.matchCount = top.n;
      it.bestScore = top.s;
    } else {
      it.pendingClaims = one("SELECT COUNT(*) AS n FROM claims WHERE item_id = ? AND status = 'pending'", r.id).n;
    }
    return it;
  });
  res.json({ items });
}));

router.get('/:id', requireAuth, h((req, res) => {
  const row = getItem(Number(req.params.id));
  if (!row) throw new HttpError(404, 'Este objeto no existe (o también se perdió).');
  const staff = isStaff(req.user);
  const owner = row.user_id === req.user.id;
  if (row.kind === 'lost' && !owner && !staff) throw new HttpError(403, 'Los reportes de pérdida son privados.');

  const item = serializeItem(row, req.user);
  const history = itemHistory(row.id);
  // Quien no es dueño ni personal ve una versión resumida del historial
  item.history = owner || staff
    ? history
    : history.filter((e) => ['reportado_encontrado', 'ingreso_custodia', 'devuelto'].includes(e.type));

  const myClaim = one('SELECT id, status, created_at FROM claims WHERE item_id = ? AND claimant_id = ? ORDER BY id DESC LIMIT 1', row.id, req.user.id);
  item.myClaim = myClaim ?? null;
  item.canClaim = row.kind === 'found' && !owner && CLAIMABLE.includes(row.status) && (!myClaim || myClaim.status === 'rejected');
  if (owner || staff) {
    item.claims = all(
      `SELECT c.id, c.answer, c.status, c.created_at, c.decided_at, u.alias AS claimant_alias
       FROM claims c JOIN users u ON u.id = c.claimant_id WHERE c.item_id = ? ORDER BY c.id DESC`, row.id);
  }
  // Coincidencia con alguno de mis reportes de pérdida (para mostrar el porcentaje en el detalle)
  if (row.kind === 'found') {
    const m = one(`SELECT m.* FROM matches m JOIN items l ON l.id = m.lost_id WHERE m.found_id = ? AND l.user_id = ? ORDER BY m.score DESC LIMIT 1`, row.id, req.user.id);
    if (m) item.myMatch = { score: m.score, visual: m.visual, text: m.text, attr: m.attr, common: JSON.parse(m.common), lostId: m.lost_id };
  }
  res.json({ item });
}));

// HU-04: coincidencias ordenadas por porcentaje
router.get('/:id/matches', requireAuth, h((req, res) => {
  const row = getItem(Number(req.params.id));
  if (!row) throw new HttpError(404, 'Objeto no encontrado.');
  if (row.user_id !== req.user.id && !isStaff(req.user)) throw new HttpError(403, 'No puedes ver estas coincidencias.');
  const rows = row.kind === 'lost'
    ? all(`SELECT m.* FROM matches m JOIN items f ON f.id = m.found_id WHERE m.lost_id = ? AND f.status IN (?,?) ORDER BY m.score DESC`, row.id, ...CLAIMABLE)
    : all(`SELECT m.* FROM matches m JOIN items l ON l.id = m.lost_id WHERE m.found_id = ? AND l.status = 'activo' ORDER BY m.score DESC`, row.id);
  res.json({ matches: rows.map((m) => serializeMatch(m, req.user, row.kind === 'lost' ? 'found' : 'lost')) });
}));

router.post('/:id/rematch', requireAuth, h((req, res) => {
  const row = getItem(Number(req.params.id));
  if (!row) throw new HttpError(404, 'Objeto no encontrado.');
  if (row.user_id !== req.user.id && !isStaff(req.user)) throw new HttpError(403, 'Sin permisos.');
  runMatching(row.id);
  res.json({ ok: true });
}));

// Cerrar un reporte de pérdida (lo recuperé por otro medio / ya no lo busco)
router.post('/:id/close', requireAuth, h((req, res) => {
  const row = getItem(Number(req.params.id));
  if (!row || row.kind !== 'lost') throw new HttpError(404, 'Reporte no encontrado.');
  if (row.user_id !== req.user.id) throw new HttpError(403, 'Solo quien reportó puede cerrarlo.');
  if (row.status !== 'activo') throw new HttpError(400, 'Este reporte ya está cerrado.');
  const status = req.body.recovered ? 'recuperado' : 'cerrado';
  tx(() => {
    run("UPDATE items SET status = ?, updated_at = datetime('now') WHERE id = ?", status, row.id);
    record(row.id, 'reporte_cerrado', req.user.id, { status });
  });
  res.json({ item: serializeItem(getItem(row.id), req.user) });
}));

// HU-03 CA1 / HU-11 CA1: el objeto ingresa a la oficina; se registra la fecha de custodia automáticamente
router.post('/:id/check-in', requireAuth, h((req, res) => {
  const row = getItem(Number(req.params.id));
  if (!row || row.kind !== 'found') throw new HttpError(404, 'Objeto no encontrado.');
  if (row.user_id !== req.user.id && !isStaff(req.user)) throw new HttpError(403, 'Sin permisos.');
  if (row.status !== 'en_espera_entrega') throw new HttpError(400, 'El objeto ya está en custodia o fue entregado.');
  const now = new Date().toISOString();
  tx(() => {
    run("UPDATE items SET custody_mode = 'office', status = 'en_custodia', custody_at = ?, updated_at = datetime('now') WHERE id = ?", now, row.id);
    record(row.id, 'ingreso_custodia', req.user.id, { at: now, receivedByStaff: isStaff(req.user) });
    applyPolicy(row.id);
  });
  if (row.user_id !== req.user.id) {
    notify(row.user_id, { type: 'status', title: 'Objeto recibido en la oficina', body: `${row.title} (${row.radicado}) ya está en custodia. ¡Gracias por devolverlo!`, link: `/objetos/${row.id}` });
  }
  // avisar a quienes lo están buscando del cambio de estado
  for (const m of all("SELECT DISTINCT l.user_id FROM matches m JOIN items l ON l.id = m.lost_id WHERE m.found_id = ? AND l.status = 'activo'", row.id)) {
    notify(m.user_id, { type: 'status', title: 'Un posible objeto tuyo cambió de estado', body: `${row.title} ahora está "${statusLabel('found', 'en_custodia')}" en ${zoneLabel('oficina')}.`, link: `/objetos/${row.id}`, email: false });
  }
  res.json({ item: serializeItem(getItem(row.id), req.user) });
}));

export default router;
