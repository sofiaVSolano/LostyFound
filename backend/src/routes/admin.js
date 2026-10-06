import { Router } from 'express';
import { all, one, run, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError, h, requireAdmin, requireStaff } from '../middleware/auth.js';
import { CATEGORIES, IN_CUSTODY, isMaterial, isCategory, materialLabel, statusLabel } from '../lib/domain.js';
import { ITEM_SELECT, serializeItem, custodyInfo } from '../lib/serialize.js';
import { record, verifyChain } from '../lib/history.js';
import { applyPolicy } from '../lib/custody.js';

const router = Router();
const getItem = (id) => one(`${ITEM_SELECT} WHERE i.id = ?`, id);
const inList = (arr) => arr.map(() => '?').join(',');

// ── HU-10: dashboard de métricas ────────────────────────────────────────────
router.get('/stats', requireStaff, h((req, res) => {
  const found = one("SELECT COUNT(*) AS n FROM items WHERE kind = 'found'").n;
  const lost = one("SELECT COUNT(*) AS n FROM items WHERE kind = 'lost'").n;
  const returned = one("SELECT COUNT(*) AS n FROM items WHERE kind = 'found' AND status = 'devuelto'").n;
  const resolved = one("SELECT COUNT(*) AS n FROM items WHERE kind = 'found' AND status IN ('devuelto','reciclado','donado')").n;
  const avg = one(`SELECT AVG((julianday(e.created_at) - julianday(i.created_at)) * 24) AS hours
                   FROM events e JOIN items i ON i.id = e.item_id WHERE e.type = 'devuelto'`).hours;
  const byCategory = CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    lost: one("SELECT COUNT(*) AS n FROM items WHERE kind = 'lost' AND category = ?", c.id).n,
    found: one("SELECT COUNT(*) AS n FROM items WHERE kind = 'found' AND category = ?", c.id).n,
    returned: one("SELECT COUNT(*) AS n FROM items WHERE kind = 'found' AND category = ? AND status = 'devuelto'", c.id).n,
  }));
  const months = [];
  const now = new Date();
  for (let k = 5; k >= 0; k--) {
    const start = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
    months.push({
      month: start.toISOString().slice(0, 7),
      found: one("SELECT COUNT(*) AS n FROM items WHERE kind='found' AND created_at >= ? AND created_at < ?", start.toISOString(), end.toISOString()).n,
      returned: one("SELECT COUNT(*) AS n FROM events WHERE type='devuelto' AND created_at >= ? AND created_at < ?", start.toISOString(), end.toISOString()).n,
    });
  }
  const custody = all(`SELECT * FROM items WHERE kind='found' AND status IN (${inList(IN_CUSTODY)})`, ...IN_CUSTODY).map((r) => custodyInfo(r));
  const statusBreakdown = all("SELECT status, COUNT(*) AS n FROM items WHERE kind='found' GROUP BY status")
    .map((r) => ({ ...r, label: statusLabel('found', r.status) }));
  res.json({
    totals: { found, lost, returned, inCustody: custody.length, pendingClaims: one("SELECT COUNT(*) AS n FROM claims WHERE status='pending'").n },
    successRate: found ? returned / found : 0,
    resolutionRate: found ? resolved / found : 0,
    avgClaimHours: avg ?? null,
    byCategory,
    months,
    statusBreakdown,
    custody: {
      overdue: custody.filter((c) => c?.state === 'vencido').length,
      soon: custody.filter((c) => c?.state === 'proximo').length,
      max: config.maxCustodyDays,
    },
    recycled: one("SELECT COUNT(*) AS n FROM items WHERE status = 'reciclado'").n,
    chain: verifyChain(),
  });
}));

// ── HU-11: tiempo de permanencia en custodia ────────────────────────────────
router.get('/custody', requireStaff, h((req, res) => {
  const rows = all(`${ITEM_SELECT} WHERE i.kind = 'found' AND i.status IN (${inList(IN_CUSTODY)}) ORDER BY i.custody_at ASC`, ...IN_CUSTODY);
  let items = rows.map((r) => serializeItem(r, req.user));
  const state = req.query.state;
  if (state === 'vencido' || state === 'proximo') items = items.filter((i) => i.custody?.state === state);
  if (state === 'policy') items = items.filter((i) => i.custody?.policyExpired);
  if (isCategory(req.query.category)) items = items.filter((i) => i.category === req.query.category);
  res.json({ items, maxDays: config.maxCustodyDays });
}));

// Objetos aún con el hallador: el personal puede recibirlos (ver /items/:id/check-in)
router.get('/awaiting', requireStaff, h((req, res) => {
  const rows = all(`${ITEM_SELECT} WHERE i.kind = 'found' AND i.status = 'en_espera_entrega' ORDER BY i.created_at ASC`);
  res.json({ items: rows.map((r) => serializeItem(r, req.user)) });
}));

// ── HU-10 CA2: iniciar protocolo de donación o disposición final ────────────
router.post('/items/:id/disposition', requireAdmin, h((req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item || item.kind !== 'found') throw new HttpError(404, 'Objeto no encontrado.');
  if (item.status !== 'en_custodia') throw new HttpError(400, 'Solo se puede iniciar el protocolo para objetos en custodia.');
  const info = custodyInfo(item);
  if (!info || (info.days < config.maxCustodyDays && !info.policyExpired)) {
    throw new HttpError(400, `El objeto lleva ${info?.days ?? 0} días; el protocolo aplica desde los ${config.maxCustodyDays} días o al vencer su política.`);
  }
  if (one("SELECT id FROM claims WHERE item_id = ? AND status IN ('pending','approved')", item.id)) {
    throw new HttpError(409, 'Hay un reclamo en curso. Resuélvelo antes de iniciar el protocolo.');
  }
  const protocol = req.body.protocol === 'donacion' ? 'donacion' : 'disposicion_final';
  tx(() => {
    run("UPDATE items SET status = 'en_disposicion', updated_at = datetime('now') WHERE id = ?", item.id);
    record(item.id, 'protocolo_iniciado', req.user.id, { protocol, days: info.days });
  });
  res.json({ item: serializeItem(getItem(item.id), req.user) });
}));

// ── HU-12: políticas de vencimiento ─────────────────────────────────────────
router.get('/policies', requireStaff, h((req, res) => {
  const policies = all('SELECT p.*, (SELECT COUNT(*) FROM items i WHERE i.policy_id = p.id) AS items FROM policies p ORDER BY p.days');
  res.json({ policies });
}));

function policyBody(b) {
  const name = String(b.name || '').trim();
  const days = Number(b.days);
  if (name.length < 3) throw new HttpError(400, 'Ponle un nombre a la política.', { field: 'name' });
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, 'Los días deben estar entre 1 y 365.', { field: 'days' });
  const category = b.category && isCategory(b.category) ? b.category : null;
  return { name, days, category, description: String(b.description || '').trim().slice(0, 300) };
}

router.post('/policies', requireAdmin, h((req, res) => {
  const p = policyBody(req.body);
  const { lastInsertRowid } = run('INSERT INTO policies (name, category, days, description) VALUES (?,?,?,?)', p.name, p.category, p.days, p.description);
  res.status(201).json({ policy: one('SELECT * FROM policies WHERE id = ?', lastInsertRowid) });
}));

router.patch('/policies/:id', requireAdmin, h((req, res) => {
  const p = policyBody(req.body);
  const id = Number(req.params.id);
  if (!one('SELECT id FROM policies WHERE id = ?', id)) throw new HttpError(404, 'Política no encontrada.');
  tx(() => {
    run('UPDATE policies SET name = ?, category = ?, days = ?, description = ? WHERE id = ?', p.name, p.category, p.days, p.description, id);
    // recalcula la fecha límite de los objetos que usan esta política
    for (const { id: itemId } of all('SELECT id FROM items WHERE policy_id = ? AND custody_at IS NOT NULL', id)) applyPolicy(itemId, id);
  });
  res.json({ policy: one('SELECT * FROM policies WHERE id = ?', id) });
}));

router.post('/items/:id/policy', requireStaff, h((req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item || !item.custody_at) throw new HttpError(400, 'El objeto debe estar en custodia para asignarle una política.');
  const policyId = req.body.policyId ? Number(req.body.policyId) : null;
  if (policyId === null) {
    run('UPDATE items SET policy_id = NULL, policy_deadline = NULL WHERE id = ?', item.id);
    record(item.id, 'politica_retirada', req.user.id, {});
  } else {
    const r = applyPolicy(item.id, policyId);
    if (!r) throw new HttpError(404, 'Política no encontrada.');
    record(item.id, 'politica_asignada', req.user.id, { policy: r.policy.name, deadline: r.deadline });
  }
  res.json({ item: serializeItem(getItem(item.id), req.user) });
}));

// ── HU-13 / HU-16: clasificación por material ───────────────────────────────
function eligibility(item) {
  const reasons = [];
  if (!['en_custodia', 'en_disposicion', 'clasificado_reciclaje'].includes(item.status)) reasons.push('El objeto no está en custodia.');
  const info = custodyInfo(item);
  if (!info || (info.days < config.maxCustodyDays && !info.policyExpired)) {
    reasons.push(`Debe superar ${config.maxCustodyDays} días en custodia o vencer su política (lleva ${info?.days ?? 0}).`);
  }
  if (one("SELECT id FROM claims WHERE item_id = ? AND status IN ('pending','approved')", item.id)) reasons.push('Tiene un reclamo en curso.');
  return reasons;
}

router.get('/items/:id/eligibility', requireStaff, h((req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item) throw new HttpError(404, 'Objeto no encontrado.');
  const reasons = eligibility(item);
  res.json({ eligible: reasons.length === 0, reasons });
}));

router.post('/items/:id/classify', requireAdmin, h((req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item || item.kind !== 'found') throw new HttpError(404, 'Objeto no encontrado.');
  if (!isMaterial(req.body.material)) throw new HttpError(400, 'Selecciona el material.', { field: 'material' });
  const recyclable = !!req.body.recyclable;
  if (recyclable) {
    const reasons = eligibility(item);
    if (reasons.length) throw new HttpError(400, `Aún no cumple las condiciones: ${reasons.join(' ')}`);
  }
  if (['asignado_reciclaje', 'reciclado', 'donado', 'devuelto'].includes(item.status)) {
    throw new HttpError(400, 'Este objeto ya tiene un destino final.');
  }
  tx(() => {
    const status = recyclable ? 'clasificado_reciclaje' : item.status === 'clasificado_reciclaje' ? 'en_disposicion' : item.status;
    run("UPDATE items SET material = ?, recyclable = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
      req.body.material, recyclable ? 1 : 0, status, item.id);
    record(item.id, 'clasificado', req.user.id, { material: req.body.material, materialLabel: materialLabel(req.body.material), recyclable });
  });
  res.json({ item: serializeItem(getItem(item.id), req.user) });
}));

router.get('/recycling/available', requireStaff, h((req, res) => {
  const params = [];
  let extra = '';
  if (isMaterial(req.query.material)) { extra = ' AND i.material = ?'; params.push(req.query.material); }
  const rows = all(`${ITEM_SELECT} WHERE i.status = 'clasificado_reciclaje'${extra} ORDER BY i.custody_at`, ...params);
  res.json({ items: rows.map((r) => serializeItem(r, req.user)) });
}));

// Candidatos: objetos vencidos aún sin clasificar como reciclables
router.get('/recycling/candidates', requireStaff, h((req, res) => {
  const rows = all(`${ITEM_SELECT} WHERE i.kind='found' AND i.status IN ('en_custodia','en_disposicion') ORDER BY i.custody_at`);
  let items = rows.map((r) => serializeItem(r, req.user)).filter((i) => i.custody && (i.custody.state === 'vencido'));
  if (req.query.material === 'plastico') items = items.filter((i) => (i.material ?? i.suggestedMaterial) === 'plastico');
  res.json({ items });
}));

// ── HU-14: empresas de reciclaje ────────────────────────────────────────────
const serializeCompany = (c) => ({
  ...c,
  materials: JSON.parse(c.materials),
  active: !!c.active,
  assigned: one('SELECT COUNT(*) AS n FROM assignments WHERE company_id = ?', c.id).n,
  disposed: one('SELECT COUNT(*) AS n FROM assignments WHERE company_id = ? AND disposed_at IS NOT NULL', c.id).n,
});

function companyBody(b) {
  const name = String(b.name || '').trim();
  const errors = {};
  if (name.length < 3) errors.name = 'Escribe el nombre de la empresa.';
  const materials = Array.isArray(b.materials) ? b.materials.filter(isMaterial) : [];
  if (!materials.length) errors.materials = 'Selecciona al menos un material que recibe.';
  const email = String(b.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Correo no válido.';
  if (!String(b.phone || '').trim() && !email) errors.phone = 'Agrega al menos un dato de contacto.';
  if (Object.keys(errors).length) throw new HttpError(400, 'Revisa los campos marcados.', { fields: errors });
  return {
    name, materials,
    nit: String(b.nit || '').trim() || null,
    contact_name: String(b.contactName || '').trim() || null,
    phone: String(b.phone || '').trim() || null,
    email: email || null,
    address: String(b.address || '').trim() || null,
  };
}

router.get('/companies', requireStaff, h((req, res) => {
  let rows = all('SELECT * FROM companies ORDER BY active DESC, name');
  if (isMaterial(req.query.material)) rows = rows.filter((c) => JSON.parse(c.materials).includes(req.query.material) && c.active);
  res.json({ companies: rows.map(serializeCompany) });
}));

router.post('/companies', requireAdmin, h((req, res) => {
  const c = companyBody(req.body);
  const { lastInsertRowid } = run(
    'INSERT INTO companies (name, nit, contact_name, phone, email, address, materials) VALUES (?,?,?,?,?,?,?)',
    c.name, c.nit, c.contact_name, c.phone, c.email, c.address, JSON.stringify(c.materials)
  );
  res.status(201).json({ company: serializeCompany(one('SELECT * FROM companies WHERE id = ?', lastInsertRowid)) });
}));

router.patch('/companies/:id', requireAdmin, h((req, res) => {
  const id = Number(req.params.id);
  if (!one('SELECT id FROM companies WHERE id = ?', id)) throw new HttpError(404, 'Empresa no encontrada.');
  if (req.body.active !== undefined && Object.keys(req.body).length === 1) {
    run('UPDATE companies SET active = ? WHERE id = ?', req.body.active ? 1 : 0, id);
  } else {
    const c = companyBody(req.body);
    run('UPDATE companies SET name=?, nit=?, contact_name=?, phone=?, email=?, address=?, materials=? WHERE id=?',
      c.name, c.nit, c.contact_name, c.phone, c.email, c.address, JSON.stringify(c.materials), id);
  }
  res.json({ company: serializeCompany(one('SELECT * FROM companies WHERE id = ?', id)) });
}));

// ── HU-15: asignación a empresa ─────────────────────────────────────────────
router.post('/items/:id/assign', requireAdmin, h((req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item || item.status !== 'clasificado_reciclaje') throw new HttpError(400, 'El objeto debe estar clasificado para reciclaje.');
  const company = one('SELECT * FROM companies WHERE id = ? AND active = 1', Number(req.body.companyId));
  if (!company) throw new HttpError(404, 'Empresa no encontrada o inactiva.');
  if (!JSON.parse(company.materials).includes(item.material)) {
    throw new HttpError(400, `${company.name} no recibe ${materialLabel(item.material).toLowerCase()}.`);
  }
  const at = new Date().toISOString();
  tx(() => {
    run('INSERT INTO assignments (item_id, company_id, assigned_by, assigned_at) VALUES (?,?,?,?)', item.id, company.id, req.user.id, at);
    run("UPDATE items SET status = 'asignado_reciclaje', updated_at = datetime('now') WHERE id = ?", item.id);
    record(item.id, 'asignado_reciclaje', req.user.id, { companyId: company.id, company: company.name, at });
  });
  res.json({ item: serializeItem(getItem(item.id), req.user) });
}));

router.post('/items/assign-batch', requireAdmin, h((req, res) => {
  const ids = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(Number) : [];
  const company = one('SELECT * FROM companies WHERE id = ? AND active = 1', Number(req.body.companyId));
  if (!company) throw new HttpError(404, 'Empresa no encontrada o inactiva.');
  const accepted = JSON.parse(company.materials);
  const at = new Date().toISOString();
  const done = [];
  const skipped = [];
  tx(() => {
    for (const id of ids) {
      const item = getItem(id);
      if (!item || item.status !== 'clasificado_reciclaje' || !accepted.includes(item.material)) { skipped.push(id); continue; }
      run('INSERT INTO assignments (item_id, company_id, assigned_by, assigned_at) VALUES (?,?,?,?)', id, company.id, req.user.id, at);
      run("UPDATE items SET status = 'asignado_reciclaje', updated_at = datetime('now') WHERE id = ?", id);
      record(id, 'asignado_reciclaje', req.user.id, { companyId: company.id, company: company.name, at });
      done.push(id);
    }
  });
  res.json({ assigned: done, skipped });
}));

router.get('/assignments', requireStaff, h((req, res) => {
  const pending = req.query.pending === '1';
  const rows = all(
    `SELECT a.*, c.name AS company_name, i.title, i.radicado, i.material, i.status, i.category, i.photos
     FROM assignments a JOIN companies c ON c.id = a.company_id JOIN items i ON i.id = a.item_id
     ${pending ? 'WHERE a.disposed_at IS NULL' : ''} ORDER BY a.assigned_at DESC`
  );
  res.json({
    assignments: rows.map((r) => ({
      ...r, photos: JSON.parse(r.photos), materialLabel: r.material ? materialLabel(r.material) : null, statusLabel: statusLabel('found', r.status),
    })),
  });
}));

// ── HU-17: disposición final ────────────────────────────────────────────────
router.post('/items/:id/dispose', requireAdmin, h((req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item) throw new HttpError(404, 'Objeto no encontrado.');
  const outcome = req.body.outcome === 'donado' ? 'donado' : 'reciclado';
  const date = new Date(req.body.date || Date.now());
  if (Number.isNaN(date.getTime()) || date > new Date(Date.now() + 60_000)) throw new HttpError(400, 'La fecha de disposición no es válida.', { field: 'date' });
  const certificate = String(req.body.certificate || '').trim().slice(0, 60) || null;
  const notes = String(req.body.notes || '').trim().slice(0, 300) || null;

  if (outcome === 'reciclado') {
    const a = one('SELECT a.*, c.name AS company FROM assignments a JOIN companies c ON c.id = a.company_id WHERE a.item_id = ? AND a.disposed_at IS NULL ORDER BY a.id DESC LIMIT 1', item.id);
    if (!a || item.status !== 'asignado_reciclaje') throw new HttpError(400, 'El objeto debe estar asignado a una empresa de reciclaje.');
    if (date < new Date(a.assigned_at) - 86_400_000) throw new HttpError(400, 'La fecha no puede ser anterior a la asignación.', { field: 'date' });
    tx(() => {
      run('UPDATE assignments SET disposed_at = ?, disposition = ?, certificate = ?, notes = ? WHERE id = ?', date.toISOString(), outcome, certificate, notes, a.id);
      run("UPDATE items SET status = 'reciclado', updated_at = datetime('now') WHERE id = ?", item.id);
      record(item.id, 'disposicion_final', req.user.id, { outcome, company: a.company, date: date.toISOString(), certificate, notes });
    });
  } else {
    if (item.status !== 'en_disposicion') throw new HttpError(400, 'La donación aplica a objetos en protocolo de disposición.');
    tx(() => {
      run("UPDATE items SET status = 'donado', updated_at = datetime('now') WHERE id = ?", item.id);
      record(item.id, 'disposicion_final', req.user.id, { outcome, date: date.toISOString(), certificate, notes });
    });
  }
  res.json({ item: serializeItem(getItem(item.id), req.user) });
}));

router.get('/chain', requireStaff, h((req, res) => res.json(verifyChain())));

// Gestión de roles (asignar personal de seguridad o administradores)
router.get('/users', requireAdmin, h((req, res) => {
  res.json({ users: all('SELECT id, name, email, role, alias, verified, created_at FROM users ORDER BY role, name') });
}));

router.patch('/users/:id', requireAdmin, h((req, res) => {
  const role = req.body.role;
  if (!['user', 'security', 'admin'].includes(role)) throw new HttpError(400, 'Rol no válido.');
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, 'No puedes cambiar tu propio rol.');
  run('UPDATE users SET role = ? WHERE id = ?', role, Number(req.params.id));
  res.json({ ok: true });
}));

export default router;
