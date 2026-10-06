import { Router } from 'express';
import { all, one, run } from '../db.js';
import { config } from '../config.js';
import { h, requireAuth } from '../middleware/auth.js';
import { subscribe } from '../lib/realtime.js';
import { CATEGORIES, ZONES, COLORS, MATERIALS, FOUND_STATUS, LOST_STATUS } from '../lib/domain.js';

const router = Router();

router.get('/meta', (_req, res) => {
  res.json({
    categories: CATEGORIES, zones: ZONES, colors: COLORS, materials: MATERIALS,
    foundStatus: FOUND_STATUS, lostStatus: LOST_STATUS,
    thresholds: { match: config.matchThreshold, notify: config.notifyThreshold },
    maxCustodyDays: config.maxCustodyDays,
    allowedDomains: config.allowedDomains,
    devMailbox: !config.isProd,
  });
});

// Estadísticas públicas para la portada
router.get('/pulse', h((_req, res) => {
  res.json({
    returned: one("SELECT COUNT(*) AS n FROM items WHERE status = 'devuelto'").n,
    active: one("SELECT COUNT(*) AS n FROM items WHERE kind = 'found' AND status IN ('en_custodia','en_espera_entrega')").n,
    recycled: one("SELECT COUNT(*) AS n FROM items WHERE status = 'reciclado'").n,
    avgHours: one("SELECT AVG((julianday(e.created_at) - julianday(i.created_at)) * 24) AS h FROM events e JOIN items i ON i.id = e.item_id WHERE e.type = 'devuelto'").h,
  });
}));

// ── HU-07: notificaciones ───────────────────────────────────────────────────
router.get('/notifications', requireAuth, h((req, res) => {
  const items = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60', req.user.id);
  const unread = one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n;
  res.json({ notifications: items, unread });
}));

router.post('/notifications/read', requireAuth, h((req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : null;
  if (ids?.length) run(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, req.user.id, ...ids);
  else run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
}));

// Flujo SSE en tiempo real. EventSource no permite cabeceras, por eso el token va en la query.
router.get('/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ userId: req.user.id })}\n\n`);
  const unsubscribe = subscribe(req.user.id, res);
  req.on('close', unsubscribe);
});

// Buzón de desarrollo: muestra los correos simulados cuando no hay SMTP
router.get('/dev/outbox', requireAuth, h((req, res) => {
  if (config.isProd) return res.status(404).end();
  const rows = req.user.role === 'admin'
    ? all('SELECT * FROM outbox ORDER BY id DESC LIMIT 50')
    : all('SELECT * FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 30', req.user.email);
  res.json({ emails: rows });
}));

export default router;
