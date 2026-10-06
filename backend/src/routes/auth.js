import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { one, run } from '../db.js';
import { config } from '../config.js';
import { HttpError, h, requireAuth, signToken } from '../middleware/auth.js';
import { publicUser } from '../lib/serialize.js';
import { randomAlias } from '../lib/privacy.js';
import { verificationCode } from '../lib/tokens.js';
import { sendMail } from '../lib/mailer.js';

const router = Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' } });

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

/** HU-01 CA1: solo dominios institucionales. */
export function isInstitutional(email) {
  const m = /^[^\s@]+@([^\s@]+)$/.exec(email);
  return !!m && config.allowedDomains.includes(m[1]);
}

function issueCode(user) {
  const code = verificationCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  run('UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?', code, expires, user.id);
  const link = `${config.clientUrl}/verificar?email=${encodeURIComponent(user.email)}&codigo=${code}`;
  sendMail(
    user.email,
    'Tu código de verificación · Lost&Found Smart',
    `Hola ${user.name.split(' ')[0]},\n\nTu código es: ${code}\nTambién puedes verificar con este enlace: ${link}\n\nEl código vence en 15 minutos.`
  );
  return code;
}

router.post('/register', limiter, h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (name.length < 3) throw new HttpError(400, 'Escribe tu nombre completo.', { field: 'name' });
  if (!isInstitutional(email)) {
    throw new HttpError(400, 'Usa tu correo institucional (@correo.usbcali.edu.co o @usbcali.edu.co).', { field: 'email' });
  }
  if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    throw new HttpError(400, 'La contraseña necesita al menos 8 caracteres, con letras y números.', { field: 'password' });
  }
  if (one('SELECT id FROM users WHERE email = ?', email)) {
    throw new HttpError(409, 'Ya existe una cuenta con este correo. ¿Quieres iniciar sesión?', { field: 'email' });
  }
  const hash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = run(
    'INSERT INTO users (email, name, password_hash, alias) VALUES (?,?,?,?)',
    email, name, hash, randomAlias()
  );
  const user = one('SELECT * FROM users WHERE id = ?', lastInsertRowid);
  const code = issueCode(user);
  res.status(201).json({
    token: signToken(user),
    user: publicUser(user),
    ...(config.isProd ? {} : { devCode: code }),
  });
}));

router.post('/verify', limiter, h((req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  const user = one('SELECT * FROM users WHERE email = ?', email);
  if (!user) throw new HttpError(404, 'No encontramos esa cuenta.');
  if (user.verified) return res.json({ token: signToken(user), user: publicUser(user) });
  if (!user.verify_code || user.verify_code !== code) throw new HttpError(400, 'El código no coincide. Revisa tu correo.', { field: 'code' });
  if (new Date(user.verify_expires) < new Date()) throw new HttpError(400, 'El código venció. Solicita uno nuevo.', { field: 'code' });
  run('UPDATE users SET verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?', user.id);
  const fresh = one('SELECT * FROM users WHERE id = ?', user.id);
  res.json({ token: signToken(fresh), user: publicUser(fresh) });
}));

router.post('/resend', limiter, h((req, res) => {
  const user = one('SELECT * FROM users WHERE email = ?', normalizeEmail(req.body.email));
  if (!user || user.verified) return res.json({ ok: true });
  const code = issueCode(user);
  res.json({ ok: true, ...(config.isProd ? {} : { devCode: code }) });
}));

router.post('/login', limiter, h(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isInstitutional(email)) {
    throw new HttpError(400, 'Solo se permite el ingreso con correo institucional.', { field: 'email' });
  }
  const user = one('SELECT * FROM users WHERE email = ?', email);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// HU-07 CA2: activar o desactivar canales de notificación
router.patch('/me', requireAuth, h((req, res) => {
  const { name, notifyPush, notifyEmail } = req.body;
  if (name !== undefined && String(name).trim().length >= 3) run('UPDATE users SET name = ? WHERE id = ?', String(name).trim(), req.user.id);
  if (notifyPush !== undefined) run('UPDATE users SET notify_push = ? WHERE id = ?', notifyPush ? 1 : 0, req.user.id);
  if (notifyEmail !== undefined) run('UPDATE users SET notify_email = ? WHERE id = ?', notifyEmail ? 1 : 0, req.user.id);
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id = ?', req.user.id)) });
}));

router.post('/me/alias', requireAuth, h((req, res) => {
  run('UPDATE users SET alias = ? WHERE id = ?', randomAlias(), req.user.id);
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id = ?', req.user.id)) });
}));

export default router;
