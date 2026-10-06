import { config } from './config.js';
import { one } from './db.js';
import { createApp } from './app.js';
import { startJobs } from './lib/jobs.js';
import { seed } from './seed.js';

if (!one('SELECT id FROM users LIMIT 1')) {
  console.log('Base de datos vacía: cargando datos de demostración…');
  seed();
}

createApp().listen(config.port, () => {
  console.log(`\n  ◎ Lost&Found Smart API escuchando en http://localhost:${config.port}`);
  if (!config.smtp.host) console.log('  ✉  Sin SMTP: los correos se guardan en el buzón de desarrollo.');
  startJobs();
});
