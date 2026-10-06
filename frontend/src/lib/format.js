const rtf = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });
const UNITS = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
  ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
];

/** SQLite guarda "YYYY-MM-DD HH:MM:SS" en UTC sin zona; lo normalizamos. */
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
}

export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return '';
  const diff = (d.getTime() - Date.now()) / 1000;
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === 'second') {
      if (unit === 'second' && Math.abs(diff) < 45) return 'justo ahora';
      return rtf.format(Math.round(diff / secs), unit);
    }
  }
  return '';
}

export const dateLong = (v) => toDate(v)?.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) ?? '';
export const dateShort = (v) => toDate(v)?.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) ?? '';
export const dateTime = (v) => toDate(v)?.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) ?? '';
export const timeOnly = (v) => toDate(v)?.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) ?? '';
export const pct = (v) => `${Math.round((v ?? 0) * 100)} %`;
export const num = (v) => new Intl.NumberFormat('es-CO').format(v ?? 0);

export function hoursLabel(h) {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1).replace('.', ',')} días`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function greeting(name) {
  const h = new Date().getHours();
  const first = (name || '').split(' ')[0];
  if (h < 5) return { hello: `Trasnochando, ${first}`, line: 'Los búhos también pierden cosas. Aquí estamos.' };
  if (h < 12) return { hello: `Buenos días, ${first}`, line: 'Que lo único que se te pierda hoy sea el sueño.' };
  if (h < 19) return { hello: `Buenas tardes, ${first}`, line: 'El campus está en movimiento — y nosotros atentos.' };
  return { hello: `Buenas noches, ${first}`, line: 'Mientras descansas, el motor sigue buscando por ti.' };
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
