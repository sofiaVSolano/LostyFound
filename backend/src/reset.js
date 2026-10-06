// Borra la base de datos y vuelve a cargar los datos de demostración: npm run seed
import { rmSync } from 'node:fs';
import { config } from './config.js';

for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbFile + suffix, { force: true });
const { seed } = await import('./seed.js');
seed();
