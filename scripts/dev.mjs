// Arranca backend (puerto 4000) y frontend (puerto 5173) a la vez: npm run dev
import { spawn } from 'node:child_process';

const run = (name, color, args) => {
  const child = spawn('npm', args, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(d.toString().replace(/^(?=.)/gm, tag)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
};

const children = [
  run('api', '36', ['run', 'dev', '--prefix', 'backend']),
  run('web', '34', ['run', 'dev', '--prefix', 'frontend']),
];
const stop = () => { children.forEach((c) => c.kill()); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
