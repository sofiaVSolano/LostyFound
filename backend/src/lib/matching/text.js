// Procesamiento de lenguaje natural ligero en español para comparar descripciones.
// Normaliza, elimina stopwords, aplica un stemmer sencillo y unifica sinónimos
// frecuentes en el campus antes de calcular similitud coseno TF-IDF.

const STOPWORDS = new Set(
  `a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bajo bien cada casi como con contra cual
  cuando de del desde donde dos el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estan
  estar este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no
  nos nuestra nuestro o otra otro para pero poco por porque que quien se sea segun ser si sin sobre su sus tal
  tambien tan tanto te tengo tenia tiene todo todos tu tus un una unas uno unos y ya yo creo perdi perdido perdida
  encontre encontrado encontrada deje dejado olvide olvidado cerca dentro fuera lado parte color marca objeto
  tiene tenia hoy ayer manana tarde noche dia salon aula`.split(/\s+/)
);

// Sinónimos → concepto canónico
const SYNONYMS = {
  celular: ['celular', 'telefono', 'movil', 'iphone', 'smartphone', 'android', 'cel'],
  portatil: ['portatil', 'laptop', 'computador', 'computadora', 'notebook', 'macbook', 'pc'],
  audifonos: ['audifono', 'audifonos', 'auricular', 'auriculares', 'airpods', 'headphones', 'diadema', 'cascos', 'earbuds'],
  termo: ['termo', 'botella', 'tomatodo', 'cilindro', 'termica', 'hydroflask', 'bidon'],
  billetera: ['billetera', 'cartera', 'monedero', 'wallet', 'tarjetero'],
  morral: ['morral', 'mochila', 'maleta', 'bolso', 'backpack', 'canguro', 'bolsa'],
  cuaderno: ['cuaderno', 'libreta', 'agenda', 'block', 'bitacora'],
  documento: ['documento', 'carnet', 'carne', 'cedula', 'identificacion', 'tarjeta', 'pasaporte', 'licencia', 'id'],
  llave: ['llave', 'llaves', 'llavero', 'llavera'],
  gafas: ['gafas', 'lentes', 'anteojos', 'gafa', 'espejuelos'],
  chaqueta: ['chaqueta', 'buzo', 'saco', 'sueter', 'hoodie', 'chompa', 'cardigan', 'abrigo', 'campera'],
  sombrilla: ['sombrilla', 'paraguas'],
  cargador: ['cargador', 'cable', 'adaptador', 'powerbank', 'bateria'],
  reloj: ['reloj', 'smartwatch', 'pulsera'],
  gorra: ['gorra', 'cachucha', 'sombrero', 'boina'],
  calculadora: ['calculadora', 'casio'],
  estuche: ['estuche', 'cartuchera', 'funda', 'case', 'forro', 'carcasa'],
  libro: ['libro', 'texto', 'novela'],
  balon: ['balon', 'pelota', 'bola'],
  lonchera: ['lonchera', 'tupper', 'portacomida', 'coca', 'recipiente'],
};
const CANON = new Map();
for (const [canon, words] of Object.entries(SYNONYMS)) for (const w of words) CANON.set(w, canon);

export const normalize = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ');

function stem(w) {
  if (CANON.has(w)) return CANON.get(w);
  let s = w;
  if (s.length > 5 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('s')) s = s.slice(0, -1);
  if (CANON.has(s)) return CANON.get(s);
  for (const suf of ['ito', 'ita', 'cito', 'cita']) if (s.length > 6 && s.endsWith(suf)) s = s.slice(0, -suf.length);
  return CANON.get(s) ?? s;
}

export function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Construye un vector TF-IDF disperso. */
export function tfidf(tokens, idf) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const vec = new Map();
  for (const [t, n] of tf) vec.set(t, (n / tokens.length) * (idf.get(t) ?? 1));
  return vec;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) if (b.has(k)) dot += v * b.get(k);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function buildIdf(docs) {
  const df = new Map();
  for (const tokens of docs) for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length || 1;
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log(1 + n / d));
  return idf;
}

export const sharedTerms = (a, b) => [...new Set(a)].filter((t) => b.includes(t));
