// Pruebas de integración del flujo completo. Ejecuta: npm test
// Usa una base de datos temporal, sin tocar la de desarrollo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'lfs-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.QUIET_MAIL = '1';

const { createApp } = await import('../src/app.js');
const { seed, DEMO_PASSWORD } = await import('../src/seed.js');
const { verifyChain } = await import('../src/lib/history.js');
const { db } = await import('../src/db.js');

let server;
let base;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function api(pathname, { token, body, form, method } = {}) {
  const res = await fetch(base + pathname, {
    method: method ?? (body || form ? 'POST' : 'GET'),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (email) => (await api('/api/auth/login', { body: { email, password: DEMO_PASSWORD } })).data.token;

before(async () => {
  seed();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('HU-01: solo correos institucionales y verificación antes de reportar', async () => {
  const bad = await api('/api/auth/register', { body: { name: 'Persona', email: 'alguien@gmail.com', password: 'Clave12345' } });
  assert.equal(bad.status, 400);
  const ok = await api('/api/auth/register', { body: { name: 'Nueva Persona', email: 'nueva@correo.usbcali.edu.co', password: 'Clave12345' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.verified, false);
  const form = new FormData();
  form.append('kind', 'lost');
  const blocked = await api('/api/items', { token: ok.data.token, form });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'UNVERIFIED');
  const wrong = await api('/api/auth/verify', { body: { email: 'nueva@correo.usbcali.edu.co', code: '000000' === ok.data.devCode ? '111111' : '000000' } });
  assert.equal(wrong.status, 400);
  const verified = await api('/api/auth/verify', { body: { email: 'nueva@correo.usbcali.edu.co', code: ok.data.devCode } });
  assert.equal(verified.data.user.verified, true);
});

test('HU-02/03/04: reportes con validación de fotos y coincidencias', async () => {
  const finder = await login('hallador@correo.usbcali.edu.co');
  const student = await login('estudiante@correo.usbcali.edu.co');

  const gif = new FormData();
  gif.append('kind', 'found');
  gif.append('photos', new Blob([Buffer.from('GIF89a')], { type: 'image/gif' }), 'x.gif');
  assert.equal((await api('/api/items', { token: finder, form: gif })).status, 400);

  const found = new FormData();
  for (const [k, v] of Object.entries({ kind: 'found', title: 'Billetera de cuero café', category: 'accesorios', color: 'cafe', brand: 'Vélez',
    description: 'Billetera café de cuero con tarjetas', zone: 'biblioteca', custodyMode: 'holder', securityQuestion: '¿Qué foto hay adentro?', securityDetail: 'Un gato' })) found.append(k, v);
  found.append('photos', new Blob([PNG], { type: 'image/png' }), 'billetera.png');
  const f = await api('/api/items', { token: finder, form: found });
  assert.equal(f.status, 201);
  assert.match(f.data.item.radicado, /^LF-\d{4}-\d{4}-[A-Z2-9]{2}$/);
  assert.equal(f.data.item.status, 'en_espera_entrega');

  const lost = new FormData();
  for (const [k, v] of Object.entries({ kind: 'lost', title: 'Billetera café', category: 'accesorios', color: 'cafe', brand: 'Velez',
    description: 'Perdí mi billetera de cuero café en la biblioteca', zone: 'biblioteca' })) lost.append(k, v);
  const l = await api('/api/items', { token: student, form: lost });
  assert.equal(l.status, 201);
  const m = l.data.matches.find((x) => x.item.id === f.data.item.id);
  assert.ok(m && m.score >= 0.6, 'debe encontrar la billetera');
  assert.ok(m.common.some((c) => c.key === 'brand'));
  // la respuesta privada nunca se expone a terceros
  const view = await api(`/api/items/${f.data.item.id}`, { token: student });
  assert.equal(view.data.item.securityDetail, undefined);
});

test('HU-05/06/08: reclamo, chat anónimo y entrega con QR', async () => {
  const admin = await login('admin@usbcali.edu.co');
  const student = await login('estudiante@correo.usbcali.edu.co');
  const items = (await api('/api/items?q=Audífonos', { token: student })).data.items;
  const airpods = items[0];
  const c = await api('/api/claims', { token: student, body: { itemId: airpods.id, answer: 'Una luna' } });
  assert.equal(c.status, 201);
  assert.equal((await api(`/api/claims/${c.data.claim.id}/messages`, { token: student })).status, 403);
  const d = await api(`/api/claims/${c.data.claim.id}/decide`, { token: admin, body: { approve: true } });
  assert.equal(d.data.claim.status, 'approved');
  const msg = await api(`/api/claims/${c.data.claim.id}/messages`, { token: student, body: { body: 'Mi número es 300 123 4567 y correo yo@gmail.com' } });
  assert.equal(msg.data.message.redacted, true);
  assert.doesNotMatch(msg.data.message.body, /300|gmail/);
  const qr = await api(`/api/claims/${c.data.claim.id}/qr`, { token: student });
  assert.match(qr.data.token, /^LFS1\./);
  assert.equal((await api('/api/handover/redeem', { token: student, body: { token: qr.data.token } })).status, 403);
  assert.equal((await api('/api/handover/redeem', { token: admin, body: { token: 'LFS1.1.1.aaaaaaaaaaaaaaaaaaaa' } })).status, 400);
  const r = await api('/api/handover/redeem', { token: admin, body: { token: qr.data.token } });
  assert.equal(r.status, 200);
  assert.equal(r.data.acta.hash.length, 64);
  const after = await api(`/api/items/${airpods.id}`, { token: admin });
  assert.equal(after.data.item.status, 'devuelto');
  assert.ok(verifyChain().ok);
  assert.throws(() => db.exec('DELETE FROM events'), /inmutable/);
});

test('HU-10/11/12: métricas, custodia y políticas', async () => {
  const admin = await login('admin@usbcali.edu.co');
  const stats = await api('/api/admin/stats', { token: admin });
  assert.ok(stats.data.successRate > 0);
  assert.equal(stats.data.byCategory.length, 9);
  const overdue = await api('/api/admin/custody?state=vencido', { token: admin });
  assert.ok(overdue.data.items.length >= 2);
  assert.ok(overdue.data.items.every((i) => i.custody.state === 'vencido'));
  const policy = await api('/api/admin/custody?state=policy', { token: admin });
  assert.ok(policy.data.items.every((i) => i.custody.policyExpired));
  const student = await login('estudiante@correo.usbcali.edu.co');
  assert.equal((await api('/api/admin/stats', { token: student })).status, 403);
});

test('HU-13 a HU-17: clasificación, empresas, asignación y disposición', async () => {
  const admin = await login('admin@usbcali.edu.co');
  const recent = (await api('/api/admin/custody', { token: admin })).data.items.find((i) => i.custody.state === 'ok');
  const early = await api(`/api/admin/items/${recent.id}/classify`, { token: admin, body: { material: 'textil', recyclable: true } });
  assert.equal(early.status, 400, 'no se puede reciclar antes de cumplir el plazo');

  const termo = (await api('/api/admin/recycling/candidates?material=plastico', { token: admin })).data.items.find((i) => /Termo/.test(i.title));
  assert.equal(termo.suggestedMaterial, 'plastico');
  const cl = await api(`/api/admin/items/${termo.id}/classify`, { token: admin, body: { material: 'plastico', recyclable: true } });
  assert.equal(cl.data.item.status, 'clasificado_reciclaje');

  const comp = await api('/api/admin/companies', { token: admin, body: { name: 'Recicladora Prueba', phone: '3000000', materials: ['vidrio'] } });
  assert.equal(comp.status, 201);
  const wrongMaterial = await api(`/api/admin/items/${termo.id}/assign`, { token: admin, body: { companyId: comp.data.company.id } });
  assert.equal(wrongMaterial.status, 400);
  const plastics = (await api('/api/admin/companies?material=plastico', { token: admin })).data.companies;
  assert.ok(plastics.length >= 1);
  const as = await api(`/api/admin/items/${termo.id}/assign`, { token: admin, body: { companyId: plastics[0].id } });
  assert.equal(as.data.item.status, 'asignado_reciclaje');
  const disp = await api(`/api/admin/items/${termo.id}/dispose`, { token: admin, body: { outcome: 'reciclado', certificate: 'C-1' } });
  assert.equal(disp.data.item.status, 'reciclado');
  const hist = (await api(`/api/items/${termo.id}`, { token: admin })).data.item.history.map((e) => e.type);
  assert.deepEqual(hist.slice(-3), ['clasificado', 'asignado_reciclaje', 'disposicion_final']);
});
