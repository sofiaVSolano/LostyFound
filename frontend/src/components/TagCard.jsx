import { Link } from 'react-router-dom';
import { MapPin, Clock } from 'lucide-react';
import { ItemArt, ScoreRing, StatusBadge } from './ui.jsx';
import { timeAgo } from '../lib/format.js';

/**
 * Tarjeta con forma de etiqueta de equipaje: ojal, cordel y borde perforado.
 * Toda la tarjeta es clicable, pero solo el título es el enlace (mejor para lectores de pantalla).
 */
export function TagCard({ item, to, score, common, extra, style }) {
  const href = to ?? `/objetos/${item.id}`;
  return (
    <article className="tag" style={style}>
      <svg className="tag-string" viewBox="0 0 60 40" aria-hidden="true">
        <path d="M30 40 C 30 22, 50 18, 58 2" />
      </svg>
      <span className="tag-hole" aria-hidden="true" />
      <ItemArt item={item} className="tag-art" />
      <div className="tag-body">
        <div className="spread tag-top">
          <span className="tag-radicado mono">{item.radicado}</span>
          <StatusBadge status={item.status} label={item.statusLabel} />
        </div>
        <h3 className="tag-title">
          <Link to={href} className="tag-link">{item.title}</Link>
        </h3>
        <p className="tag-meta">
          <span><MapPin aria-hidden="true" />{item.zoneLabel}</span>
          <span><Clock aria-hidden="true" /><time dateTime={item.eventAt}>{timeAgo(item.eventAt)}</time></span>
        </p>
        {common?.length > 0 && (
          <ul className="tag-common" aria-label="Atributos en común">
            {common.slice(0, 4).map((c) => <li key={c.key + c.label}>{c.label}</li>)}
          </ul>
        )}
        {extra}
      </div>
      {score != null && (
        <div className="tag-score">
          <ScoreRing value={score} size={64} stroke={6} />
        </div>
      )}
    </article>
  );
}
