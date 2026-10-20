import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { HttpError } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import claimRoutes, { handoverRouter } from './routes/claims.js';
import adminRoutes from './routes/admin.js';
import miscRoutes from './routes/misc.js';
import rewardRoutes from './routes/rewards.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(cors({ origin: [config.clientUrl, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
  app.use(express.json({ limit: '200kb' }));

  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', immutable: true }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'lostfound-smart', time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/claims', claimRoutes);
  app.use('/api/handover', handoverRouter);
  app.use('/api/admin', adminRoutes);
  app.use('/api/rewards', rewardRoutes);
  app.use('/api', miscRoutes);

  // En producción, el backend también sirve el frontend compilado
  const dist = path.resolve(config.root, '..', 'frontend', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Cada foto debe pesar menos de 10 MB.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Puedes subir máximo 3 fotos.'
        : 'No pudimos procesar las fotos.';
      return res.status(400).json({ error: msg, field: 'photos' });
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Algo salió mal de nuestro lado. Intenta de nuevo.' : err.message, ...(err.extra || {}) });
  });

  return app;
}
