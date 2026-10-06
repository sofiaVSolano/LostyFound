// Visión por computadora en el navegador: convierte cada foto en un "embedding" visual
// ligero que el backend compara (ver backend/src/lib/matching/visual.js).
//   · hist: histograma de color RGB 4x4x4 (64 dimensiones, normalizado)
//   · hash: dHash perceptual de 64 bits (estructura / forma)
//   · dominant: colores dominantes
// Procesar en el dispositivo evita subir datos extra y responde al instante.

const BINS = 4;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('No pudimos leer la imagen.')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function dHash(img) {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (x, y) => { const i = (y * 9 + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray(x, y) > gray(x + 1, y) ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export async function analyzeImage(file) {
  const img = await loadImage(file);
  const size = 96;
  const ratio = Math.min(size / img.width, size / img.height);
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const hist = new Array(BINS ** 3).fill(0);
  const sums = new Map();
  let n = 0;
  // Damos más peso al centro de la foto, donde suele estar el objeto
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      const weight = 1.6 - Math.min(1, Math.hypot(dx, dy)) ;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const bin = Math.min(3, r >> 6) * 16 + Math.min(3, g >> 6) * 4 + Math.min(3, b >> 6);
      hist[bin] += weight;
      n += weight;
      const s = sums.get(bin) ?? [0, 0, 0, 0];
      s[0] += r * weight; s[1] += g * weight; s[2] += b * weight; s[3] += weight;
      sums.set(bin, s);
    }
  }
  const norm = hist.map((v) => Number((v / (n || 1)).toFixed(5)));
  const dominant = [...sums.entries()]
    .sort((a, b) => b[1][3] - a[1][3])
    .slice(0, 3)
    .map(([, s]) => toHex(s[0] / s[3], s[1] / s[3], s[2] / s[3]));

  return { vector: { hist: norm, hash: dHash(img), dominant }, width: img.width, height: img.height };
}

/** Busca el color con nombre más cercano a los tonos dominantes, ignorando fondos neutros. */
export function suggestColor(dominant, colors) {
  const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  const candidates = dominant.map(rgb);
  const pick = candidates.find((c) => sat(c) > 0.28) ?? candidates[0];
  if (!pick) return null;
  let best = null;
  for (const color of colors) {
    if (!color.hex) continue;
    const [r, g, b] = rgb(color.hex);
    const d = Math.hypot(pick[0] - r, pick[1] - g, pick[2] - b);
    if (!best || d < best.d) best = { id: color.id, label: color.label, hex: color.hex, d };
  }
  return best && best.d < 140 ? best : null;
}
