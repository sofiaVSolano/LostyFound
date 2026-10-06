import { all, one, run, tx } from '../../db.js';
import { config } from '../../config.js';
import { COLORS, ZONES, CLAIMABLE, categoryLabel, colorLabel, zoneLabel } from '../domain.js';
import { tokenize, tfidf, cosine, buildIdf, sharedTerms, normalize } from './text.js';
import { visualSimilarity, vectorSimilarity, hexToRgb } from './visual.js';
import { notify } from '../notify.js';

const docOf = (it) =>
  [it.title, it.title, it.description, it.brand, it.color && colorLabel(it.color), categoryLabel(it.category)]
    .filter(Boolean)
    .join(' ');

function colorSimilarity(a, b) {
  if (!a || !b) return 0.5;
  if (a === b) return 1;
  if (a === 'multicolor' || b === 'multicolor') return 0.5;
  const ca = COLORS.find((c) => c.id === a)?.hex;
  const cb = COLORS.find((c) => c.id === b)?.hex;
  if (!ca || !cb) return 0.5;
  const [r1, g1, b1] = hexToRgb(ca);
  const [r2, g2, b2] = hexToRgb(cb);
  const d = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  return Math.max(0, 1 - d / 220);
}

function zoneSimilarity(a, b) {
  if (a === b) return 1;
  const za = ZONES.find((z) => z.id === a);
  const zb = ZONES.find((z) => z.id === b);
  if (!za || !zb) return 0.3;
  return Math.max(0, 1 - Math.hypot(za.x - zb.x, za.y - zb.y) / 650);
}

function timeSimilarity(lostAt, foundAt) {
  const days = (new Date(foundAt) - new Date(lostAt)) / 86_400_000;
  if (days < -1) return 0.15; // encontrado antes de perderse: poco probable
  return Math.exp(-Math.max(0, days) / 25);
}

const sameBrand = (a, b) => {
  const x = normalize(a).trim();
  const y = normalize(b).trim();
  return x && y && (x === y || x.includes(y) || y.includes(x));
};

/** Compara un reporte de pérdida con un hallazgo y explica qué tienen en común (HU-04 CA2). */
export function compare(lost, found, idf) {
  const tl = lost._tokens ?? tokenize(docOf(lost));
  const tf = found._tokens ?? tokenize(docOf(found));
  const text = Math.sqrt(cosine(tfidf(tl, idf), tfidf(tf, idf)));

  const vl = lost.visual_vec ? JSON.parse(lost.visual_vec) : null;
  const vf = found.visual_vec ? JSON.parse(found.visual_vec) : null;
  const visual = visualSimilarity(vl, vf);

  const cat = lost.category === found.category ? 1 : 0;
  const color = colorSimilarity(lost.color, found.color);
  const brand = lost.brand && found.brand ? (sameBrand(lost.brand, found.brand) ? 1 : 0) : 0.5;
  const zone = zoneSimilarity(lost.zone, found.zone);
  const time = timeSimilarity(lost.event_at, found.event_at);
  const attr = 0.4 * cat + 0.25 * color + 0.15 * brand + 0.1 * zone + 0.1 * time;

  let score = visual == null ? 0.45 * text + 0.55 * attr : 0.4 * visual + 0.3 * text + 0.3 * attr;
  if (!cat) score *= 0.6;
  score = Math.max(0, Math.min(1, score));

  const common = [];
  if (cat) common.push({ key: 'category', label: categoryLabel(found.category) });
  if (lost.color && found.color && color >= 0.8) {
    common.push({ key: 'color', label: lost.color === found.color ? `Color ${colorLabel(found.color).toLowerCase()}` : 'Tono de color similar' });
  }
  if (lost.brand && found.brand && brand === 1) common.push({ key: 'brand', label: `Marca ${found.brand}` });
  const catWord = normalize(categoryLabel(found.category)).trim();
  const terms = sharedTerms(tl, tf).filter((t) => t.length > 2 && t !== catWord).slice(0, 4);
  if (terms.length) common.push({ key: 'terms', label: terms.join(', ') });
  if (zone === 1) common.push({ key: 'zone', label: `Misma zona: ${zoneLabel(found.zone)}` });
  else if (zone > 0.75) common.push({ key: 'zone', label: 'Zona cercana' });
  if (visual != null && visual >= 0.7) common.push({ key: 'visual', label: 'Apariencia similar en la foto' });

  return { score, text, visual: visual ?? 0, attr, common };
}

/**
 * Ejecuta el motor para un reporte recién publicado y guarda las coincidencias
 * que superan el umbral (60 %). Notifica en tiempo real las que superan el 80 %.
 */
export function runMatching(itemId) {
  const item = one('SELECT * FROM items WHERE id = ?', itemId);
  if (!item) return [];
  const isLost = item.kind === 'lost';
  const candidates = isLost
    ? all(`SELECT * FROM items WHERE kind = 'found' AND status IN (${CLAIMABLE.map(() => '?').join(',')})`, ...CLAIMABLE)
    : item.status && CLAIMABLE.includes(item.status)
      ? all("SELECT * FROM items WHERE kind = 'lost' AND status = 'activo'")
      : [];

  const corpus = all(
    `SELECT title, description, brand, color, category FROM items
     WHERE (kind='lost' AND status='activo') OR (kind='found' AND status IN ('en_espera_entrega','en_custodia'))`
  );
  const idf = buildIdf(corpus.map((d) => tokenize(docOf(d))));
  item._tokens = tokenize(docOf(item));

  const results = [];
  tx(() => {
    for (const other of candidates) {
      if (other.user_id === item.user_id) continue;
      const lost = isLost ? item : other;
      const found = isLost ? other : item;
      const r = compare(lost, found, idf);
      const existing = one('SELECT id, score FROM matches WHERE lost_id = ? AND found_id = ?', lost.id, found.id);
      if (r.score < config.matchThreshold) {
        if (existing) run('DELETE FROM matches WHERE id = ?', existing.id);
        continue;
      }
      if (existing) {
        run('UPDATE matches SET score=?, visual=?, text=?, attr=?, common=? WHERE id=?',
          r.score, r.visual, r.text, r.attr, JSON.stringify(r.common), existing.id);
      } else {
        run('INSERT INTO matches (lost_id, found_id, score, visual, text, attr, common) VALUES (?,?,?,?,?,?,?)',
          lost.id, found.id, r.score, r.visual, r.text, r.attr, JSON.stringify(r.common));
      }
      results.push({ lost, found, ...r, isNew: !existing });
    }
  });

  for (const r of results) {
    if (r.isNew && r.score >= config.notifyThreshold) {
      notify(r.lost.user_id, {
        type: 'match',
        title: `¡Coincidencia del ${Math.round(r.score * 100)} %!`,
        body: `Encontramos un objeto muy parecido a "${r.lost.title}": ${r.found.title} (${zoneLabel(r.found.zone)}).`,
        link: `/objetos/${r.found.id}?desde=${r.lost.id}`,
      });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Vista previa en vivo: compara un borrador sin guardarlo (usada por el formulario de reporte). */
export function previewMatches(draft) {
  const candidates = all(`SELECT * FROM items WHERE kind = 'found' AND status IN ('en_espera_entrega','en_custodia')`);
  const idf = buildIdf(candidates.map((d) => tokenize(docOf(d))));
  const lost = { ...draft, event_at: draft.event_at || new Date().toISOString(), visual_vec: draft.visual ? JSON.stringify(draft.visual) : null };
  return candidates
    .map((found) => ({ found, ...compare(lost, found, idf) }))
    .filter((r) => r.score >= config.matchThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export { vectorSimilarity };
