import { useMeta } from '../context/AppContext.jsx';

/**
 * Mapa interactivo del campus (HU-09). Cada zona es un botón accesible con teclado.
 * mode="browse": muestra marcadores con el número de objetos por zona.
 * mode="pick": permite elegir una zona en un formulario.
 */
export function CampusMap({ counts = {}, selected, onSelect, mode = 'browse', label = 'Mapa del campus' }) {
  const meta = useMeta();
  if (!meta) return <div className="campus-map skeleton" style={{ aspectRatio: '1000/640' }} />;

  const keyHandler = (id) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(selected === id && mode === 'browse' ? null : id); }
  };

  return (
    <figure className={`campus-map campus-${mode}`}>
      <svg viewBox="0 0 1000 640" role="group" aria-label={label}>
        <defs>
          <pattern id="cm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" className="cm-gridline" />
          </pattern>
          <radialGradient id="cm-glow">
            <stop offset="0" stopColor="var(--cyan)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--cyan)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1000" height="640" rx="28" className="cm-ground" />
        <rect width="1000" height="640" rx="28" fill="url(#cm-grid)" />
        {/* senderos */}
        <path className="cm-path" d="M110 585 C 220 560, 260 470, 360 440 S 470 380, 500 320 S 610 250, 690 230 S 820 170, 880 140" />
        <path className="cm-path" d="M500 160 V 500 M 300 200 C 380 260, 420 300, 500 320 M 690 410 C 600 380, 560 350, 500 320 M 880 340 C 800 360, 760 400, 690 410 M 860 545 C 760 520, 640 540, 500 540" />
        {/* árboles */}
        {[[200, 120], [230, 300], [420, 470], [600, 440], [780, 300], [760, 520], [960, 260], [400, 60], [640, 60], [180, 250]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 9 : 13} className="cm-tree" />
        ))}
        {meta.zones.map((z) => {
          const n = counts[z.id] ?? 0;
          const isSel = selected === z.id;
          const clickable = !!onSelect;
          return (
            <g
              key={z.id}
              className={`cm-zone ${isSel ? 'is-selected' : ''} ${n ? 'has-items' : ''}`}
              {...(clickable ? {
                role: 'button',
                tabIndex: 0,
                'aria-pressed': isSel,
                'aria-label': mode === 'browse' ? `${z.label}: ${n} ${n === 1 ? 'objeto' : 'objetos'}` : z.label,
                onClick: () => onSelect(isSel && mode === 'browse' ? null : z.id),
                onKeyDown: keyHandler(z.id),
              } : { 'aria-hidden': true })}
            >
              {z.round ? (
                <circle cx={z.x} cy={z.y} r={z.w / 2} className="cm-shape" />
              ) : (
                <rect x={z.x - z.w / 2} y={z.y - z.h / 2} width={z.w} height={z.h} rx="14" className="cm-shape" />
              )}
              <text x={z.x} y={z.y + (mode === 'browse' && n ? 30 : 5)} className="cm-label" textAnchor="middle">
                {z.short ?? z.label}
              </text>
              {z.safe && <text x={z.x + z.w / 2 - 14} y={z.y - z.h / 2 + 22} className="cm-safe" textAnchor="middle" aria-hidden="true">◆</text>}
              {mode === 'browse' && n > 0 && (
                <g transform={`translate(${z.x} ${z.y - 6})`}>
                  <g className="cm-marker">
                    <circle r="34" fill="url(#cm-glow)" className="cm-halo" />
                    <circle r="17" className="cm-pin" />
                    <text y="5.5" textAnchor="middle" className="cm-count">{n}</text>
                  </g>
                </g>
              )}
              {mode === 'pick' && isSel && (
                <g transform={`translate(${z.x} ${z.y - 20})`} className="cm-picked">
                  <path d="M0 0 C -12 -14 -12 -30 0 -30 C 12 -30 12 -14 0 0Z" />
                  <circle cy="-20" r="4.5" className="cm-picked-dot" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="cm-legend">
        <span><i className="cm-key cm-key-pin" aria-hidden="true" /> Objetos encontrados</span>
        <span><span aria-hidden="true" className="cm-key-safe">◆</span> Punto seguro de entrega</span>
      </figcaption>
    </figure>
  );
}
