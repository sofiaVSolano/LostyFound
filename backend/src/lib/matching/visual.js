// Embeddings visuales. El navegador extrae de cada foto (ver frontend/src/lib/vision.js):
//   hist: histograma de color RGB 4x4x4 normalizado (64 dimensiones)
//   hash: dHash perceptual de 64 bits en hexadecimal (forma / estructura)
//   dominant: colores dominantes en hexadecimal
// El rol MLOps puede reemplazar este módulo por embeddings CLIP manteniendo la misma interfaz.

const BINS = 4;

export function histogramIntersection(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return s;
}

/** Bhattacharyya: más tolerante que la intersección ante cambios de iluminación. */
export function bhattacharyya(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.sqrt(a[i] * b[i]);
  return Math.min(1, s);
}

export function hashSimilarity(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 0;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    let x = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    while (x) { diff += x & 1; x >>= 1; }
  }
  return 1 - diff / (h1.length * 4);
}

export function vectorSimilarity(a, b) {
  const color = 0.55 * bhattacharyya(a.hist, b.hist) + 0.45 * histogramIntersection(a.hist, b.hist);
  const shape = a.hash && b.hash ? hashSimilarity(a.hash, b.hash) : null;
  // dHash de fotos distintas del mismo objeto rara vez supera 0.75; reescalamos a [0,1]
  const shapeScore = shape == null ? null : Math.max(0, (shape - 0.5) / 0.35);
  return shapeScore == null ? color : 0.75 * color + 0.25 * Math.min(1, shapeScore);
}

/** Mejor similitud entre cualquier par de fotos de dos reportes. */
export function visualSimilarity(vecsA, vecsB) {
  if (!vecsA?.length || !vecsB?.length) return null;
  let best = 0;
  for (const a of vecsA) for (const b of vecsB) best = Math.max(best, vectorSimilarity(a, b));
  return best;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Vector sintético a partir de un color (usado para datos de demostración sin foto). */
export function syntheticVector(hex, spread = 0.18) {
  const hist = new Array(BINS ** 3).fill(0);
  const [r, g, b] = hexToRgb(hex);
  const bin = (v) => Math.min(BINS - 1, Math.floor(v / (256 / BINS)));
  const main = bin(r) * 16 + bin(g) * 4 + bin(b);
  hist[main] = 1 - spread;
  // un poco de "fondo" gris claro y sombra oscura, como en una foto real
  hist[bin(200) * 16 + bin(200) * 4 + bin(205)] += spread * 0.6;
  hist[0] += spread * 0.4;
  return { hist, hash: null, dominant: [hex] };
}

export function isValidVector(v) {
  return (
    v && Array.isArray(v.hist) && v.hist.length === BINS ** 3 &&
    v.hist.every((x) => typeof x === 'number' && x >= 0 && x <= 1) &&
    (v.hash == null || /^[0-9a-f]{16}$/.test(v.hash)) &&
    (v.dominant == null || (Array.isArray(v.dominant) && v.dominant.length <= 5 && v.dominant.every((h) => /^#[0-9a-f]{6}$/i.test(h))))
  );
}
