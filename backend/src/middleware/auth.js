import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const signToken = (user) => jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '7d' });

function userFromToken(token) {
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    return one('SELECT * FROM users WHERE id = ?', sub) ?? null;
  } catch {
    return null;
  }
}

/** Adjunta req.user si hay un token válido, sin exigirlo. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  req.user = token ? userFromToken(token) : null;
  next();
}

export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return next(new HttpError(401, 'Inicia sesión para continuar.'));
    next();
  });
}

/** HU-01 CA2: la cuenta debe estar verificada antes de permitir reportes. */
export function requireVerified(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.verified) return next(new HttpError(403, 'Verifica tu correo institucional para poder reportar.', { code: 'UNVERIFIED' }));
    next();
  });
}

export const requireRole = (...roles) => (req, res, next) =>
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'No tienes permisos para esta acción.'));
    next();
  });

export const requireStaff = requireRole('admin', 'security');
export const requireAdmin = requireRole('admin');

/** Envuelve handlers síncronos/asíncronos para que los errores lleguen al middleware de errores. */
export const h = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.catch === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};
