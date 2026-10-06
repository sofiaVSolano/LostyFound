import { useId, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, Recycle, Factory, Timer, Users, Table2, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AppContext.jsx';

export function AdminNav() {
  const { isAdmin } = useAuth();
  const links = [
    ['/admin', 'Métricas', LayoutDashboard],
    ['/admin/custodia', 'Custodia', Building2],
    ['/admin/reciclaje', 'Reciclaje', Recycle],
    ['/admin/empresas', 'Empresas', Factory],
    ['/admin/politicas', 'Políticas', Timer],
    ...(isAdmin ? [['/admin/usuarios', 'Usuarios', Users]] : []),
  ];
  return (
    <nav className="admin-nav" aria-label="Administración">
      {links.map(([to, label, I]) => (
        <NavLink key={to} to={to} end className="admin-link"><I aria-hidden="true" /> {label}</NavLink>
      ))}
    </nav>
  );
}

/**
 * Barras agrupadas en SVG. Dos series máximo, colores validados para daltonismo,
 * leyenda siempre visible, etiquetas directas, tooltip al pasar o enfocar y vista de tabla.
 */
export function GroupedBars({ title, description, data, series, labelKey = 'label', horizontal = false, formatLabel = (v) => v }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key])));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const ticks = [0, nice / 2, nice];

  return (
    <figure className="chart card card-pad" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
      <div className="spread chart-head">
        <div>
          <h3 id={`${id}-t`}>{title}</h3>
          <p id={`${id}-d`} className="muted small">{description}</p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? <><BarChart3 aria-hidden="true" /> Ver gráfico</> : <><Table2 aria-hidden="true" /> Ver tabla</>}
        </button>
      </div>
      <ul className="legend" aria-label="Leyenda">
        {series.map((s) => <li key={s.key}><i style={{ background: `var(${s.color})` }} aria-hidden="true" /> {s.label}</li>)}
      </ul>

      {asTable ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">{horizontal ? 'Categoría' : 'Mes'}</th>{series.map((s) => <th key={s.key} scope="col" className="num">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((d) => <tr key={d[labelKey]}><th scope="row">{formatLabel(d[labelKey])}</th>{series.map((s) => <td key={s.key} className="num">{d[s.key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : horizontal ? (
        <div className="hbars" role="list">
          {data.map((d, i) => (
            <div
              key={d[labelKey]} className={`hbar-row ${hover === i ? 'is-hover' : ''}`} role="listitem" tabIndex={0}
              aria-label={`${formatLabel(d[labelKey])}: ${series.map((s) => `${s.label} ${d[s.key]}`).join(', ')}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            >
              <span className="hbar-label">{formatLabel(d[labelKey])}</span>
              <span className="hbar-tracks" aria-hidden="true">
                {series.map((s) => (
                  <span key={s.key} className="hbar-line">
                    <span className="hbar" style={{ width: `${(d[s.key] / nice) * 100}%`, background: `var(${s.color})` }} />
                    <span className="hbar-val">{d[s.key]}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="vbars-wrap">
          <svg className="vbars" viewBox="0 0 600 240" role="img" aria-label={`${title}. Usa “Ver tabla” para leer los valores.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1="40" x2="590" y1={210 - (t / nice) * 180} y2={210 - (t / nice) * 180} className="grid-line" />
                <text x="32" y={214 - (t / nice) * 180} textAnchor="end" className="axis-text">{t}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const gw = 550 / data.length;
              const bw = Math.min(26, (gw - 24) / series.length);
              const x0 = 40 + i * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
              return (
                <g key={d[labelKey]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={40 + i * gw} y="20" width={gw} height="200" fill="transparent" />
                  {series.map((s, k) => {
                    const h = Math.max(d[s.key] ? 4 : 0, (d[s.key] / nice) * 180);
                    const x = x0 + k * (bw + 2);
                    return (
                      <g key={s.key}>
                        <path d={`M${x} 210 V${210 - h + 4} q0 -4 4 -4 h${bw - 8} q4 0 4 4 V210 Z`} fill={`var(${s.color})`} className={hover != null && hover !== i ? 'dim' : ''} />
                        {(hover === i || data.length <= 6) && d[s.key] > 0 && <text x={x + bw / 2} y={204 - h} textAnchor="middle" className="bar-val">{d[s.key]}</text>}
                      </g>
                    );
                  })}
                  <text x={40 + i * gw + gw / 2} y="232" textAnchor="middle" className="axis-text">{formatLabel(d[labelKey])}</text>
                </g>
              );
            })}
          </svg>
          {hover != null && (
            <div className="chart-tip" role="status" style={{ left: `${((hover + 0.5) / data.length) * 92 + 6}%` }}>
              <strong>{formatLabel(data[hover][labelKey])}</strong>
              {series.map((s) => <span key={s.key}><i style={{ background: `var(${s.color})` }} /> {s.label}: <b>{data[hover][s.key]}</b></span>)}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
