import { one, all, run } from '../db.js';
import { emit } from './realtime.js';
import { sendMail } from './mailer.js';
import { config } from '../config.js';

/**
 * Crea una notificación in-app, la empuja en tiempo real (SSE → notificación Push del navegador)
 * y, si el usuario lo tiene activo, la envía por correo (HU-07).
 */
export function notify(userId, { type, title, body, link = null, email = true }) {
  const user = one('SELECT id, email, name, notify_push, notify_email FROM users WHERE id = ?', userId);
  if (!user) return;
  const { lastInsertRowid } = run(
    'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)',
    userId, type, title, body, link
  );
  emit(userId, 'notification', {
    id: Number(lastInsertRowid), type, title, body, link, read: 0,
    created_at: new Date().toISOString(), push: !!user.notify_push,
  });
  if (email && user.notify_email) {
    const url = link ? `${config.clientUrl}${link}` : config.clientUrl;
    sendMail(user.email, `Lost&Found Smart · ${title}`, `Hola ${user.name.split(' ')[0]},\n\n${body}\n\nVer en la app: ${url}`);
  }
}

export function notifyStaff(payload, exceptId = null) {
  for (const { id } of all("SELECT id FROM users WHERE role IN ('admin','security')")) {
    if (id !== exceptId) notify(id, payload);
  }
}

export function notifyAdmins(payload) {
  for (const { id } of all("SELECT id FROM users WHERE role = 'admin'")) notify(id, payload);
}
