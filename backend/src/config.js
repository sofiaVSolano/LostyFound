import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const config = {
  root,
  port: Number(env.PORT || 4000),
  isProd: env.NODE_ENV === 'production',
  quietMail: env.QUIET_MAIL === '1',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-lostfound-smart',
  qrSecret: env.QR_SECRET || 'dev-only-qr-secret-lostfound-smart',
  clientUrl: env.CLIENT_URL || 'http://localhost:5173',
  maxCustodyDays: Number(env.MAX_CUSTODY_DAYS || 90),
  dbFile: env.DB_FILE || path.join(root, 'data', 'lostfound.db'),
  uploadsDir: path.join(root, 'uploads'),
  allowedDomains: ['correo.usbcali.edu.co', 'usbcali.edu.co'],
  maxUploadBytes: 10 * 1024 * 1024,
  // HU-04 / HU-07: umbrales del motor de coincidencias
  matchThreshold: 0.6,
  notifyThreshold: 0.8,
  // HU-18: puntos de Cazador por cada objeto sin dueño entregado en custodia
  pointsPerDelivery: Number(env.POINTS_PER_DELIVERY || 3),
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || 'Lost&Found Smart <no-reply@usbcali.edu.co>',
  },
};
