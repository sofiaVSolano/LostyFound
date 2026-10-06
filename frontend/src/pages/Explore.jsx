import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Map as MapIcon, List } from 'lucide-react';
import { useAuth, useMeta } from '../context/AppContext.jsx';
import { useApi, useTitle } from '../hooks/index.js';
import { CampusMap } from '../components/CampusMap.jsx';
import { TagCard } from '../components/TagCard.jsx';
import { CategoryIcon, EmptyState, ErrorNote, Loading, PageHead } from '../components/ui.jsx';
import { plural } from '../lib/format.js';

const STATUS_OPTIONS = [
  ['en_custodia', 'En Custodia'],
  ['en_espera_entrega', 'En Espera de Entrega'],
  ['en_devolucion', 'En devolución'],
  ['devuelto', 'Devuelto'],
];

export default function Explore() {
  useTitle('Explorar objetos');
  const meta = useMeta();
  const { isStaff } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('map');
  const [showFilters, setShowFilters] = useState(false);
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(',') : v);
    }
    setParams(next, { replace: true });
  };
  const list = (k) => (params.get(k) ? params.get(k).split(',') : []);
  const categories = list('category');
  const statuses = list('status');
  const zone = params.get('zone');
  const kind = params.get('kind') === 'lost' && isStaff ? 'lost' : 'found';

  const base = useMemo(() => {
    const p = new URLSearchParams(params);
    p.delete('zone');
    p.set('limit', '60');
    return p;
  }, [params]);
  const withZone = useMemo(() => { const p = new URLSearchParams(base); if (zone) p.set('zone', zone); return p.toString(); }, [base, zone]);
  const results = useApi(`/items?${withZone}`);
  const mapData = useApi(`/items?${base.toString()}&limit=1`);
  const counts = Object.fromEntries((mapData.data?.zones ?? []).map((z) => [z.zone, z.n]));

  const activeFilters = categories.length + statuses.length + (params.get('from') ? 1 : 0) + (params.get('to') ? 1 : 0) + (zone ? 1 : 0);
  const clear = () => { setText(''); setParams(kind === 'lost' ? { kind: 'lost' } : {}, { replace: true }); };

  return (
    <div className="shell page explore">
      <PageHead eyebrow="Catálogo" title={<>Explora el <span className="serif">campus</span></>}>
        Busca manualmente entre los objetos encontrados por zona, categoría, fecha y estado.
      </PageHead>

      <div className="explore-bar">
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text }); }}>
          <Search aria-hidden="true" />
          <label htmlFor="explore-q" className="sr-only">Buscar por nombre, marca o radicado</label>
          <input id="explore-q" data-search className="input" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== q && update({ q: text })} placeholder="Buscar por nombre, marca o radicado…" />
          <kbd aria-hidden="true">/</kbd>
        </form>
        <button className="btn btn-outline filters-toggle" aria-expanded={showFilters} aria-controls="filters" onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal aria-hidden="true" /> Filtros {activeFilters > 0 && <span className="tab-count">{activeFilters}</span>}
        </button>
        {isStaff && (
          <div className="segmented" role="group" aria-label="Tipo de reporte">
            <button aria-pressed={kind === 'found'} onClick={() => update({ kind: null, status: null })}>Encontrados</button>
            <button aria-pressed={kind === 'lost'} onClick={() => update({ kind: 'lost', status: null })}>Perdidos</button>
          </div>
        )}
      </div>

      <div id="filters" className={`filters card ${showFilters ? 'is-open' : ''}`}>
        {meta && (
          <>
            <fieldset className="field">
              <legend className="field-label">Categoría</legend>
              <div className="chips">
                {meta.categories.map((c) => (
                  <label key={c.id} className="chip chip-sm">
                    <input type="checkbox" checked={categories.includes(c.id)} onChange={() => update({ category: categories.includes(c.id) ? categories.filter((x) => x !== c.id) : [...categories, c.id] })} />
                    <CategoryIcon id={c.id} /> {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {kind === 'found' && (
              <fieldset className="field">
                <legend className="field-label">Estado del objeto</legend>
                <div className="chips">
                  {STATUS_OPTIONS.map(([id, label]) => (
                    <label key={id} className="chip chip-sm">
                      <input type="checkbox" checked={statuses.includes(id)} onChange={() => update({ status: statuses.includes(id) ? statuses.filter((x) => x !== id) : [...statuses, id] })} />
                      {label}
                    </label>
                  ))}
                </div>
                {!statuses.length && <span className="field-hint">Por defecto mostramos los que aún se pueden reclamar.</span>}
              </fieldset>
            )}
            <div className="date-range">
              <label className="field"><span className="field-label">Desde</span><input type="date" className="input" value={params.get('from') ?? ''} max={params.get('to') ?? undefined} onChange={(e) => update({ from: e.target.value })} /></label>
              <label className="field"><span className="field-label">Hasta</span><input type="date" className="input" value={params.get('to') ?? ''} min={params.get('from') ?? undefined} onChange={(e) => update({ to: e.target.value })} /></label>
              <label className="field"><span className="field-label">Orden</span>
                <select className="select" value={params.get('sort') ?? 'recent'} onChange={(e) => update({ sort: e.target.value === 'recent' ? null : e.target.value })}>
                  <option value="recent">Más recientes</option>
                  <option value="oldest">Más antiguos</option>
                </select>
              </label>
            </div>
            {activeFilters > 0 && <button className="btn btn-ghost btn-sm" onClick={clear}><X aria-hidden="true" /> Limpiar filtros</button>}
          </>
        )}
      </div>

      <div className="segmented view-switch" role="group" aria-label="Vista">
        <button aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon aria-hidden="true" /> Mapa</button>
        <button aria-pressed={view === 'list'} onClick={() => setView('list')}><List aria-hidden="true" /> Lista</button>
      </div>

      <div className={`explore-layout view-${view}`}>
        <section className="explore-map" aria-label="Mapa del campus">
          <CampusMap counts={counts} selected={zone} onSelect={(z) => update({ zone: z })} label="Zonas del campus con objetos encontrados. Selecciona una para filtrar." />
          {zone && meta && (
            <div className="zone-chip">
              Mostrando: <strong>{meta.zoneById[zone]?.label}</strong>
              <button className="icon-btn" onClick={() => update({ zone: null })} aria-label="Quitar filtro de zona"><X /></button>
            </div>
          )}
        </section>
        <section className="explore-results" aria-labelledby="results-title" aria-busy={results.loading}>
          <div className="spread">
            <h2 id="results-title" className="results-title">{results.data ? plural(results.data.total, 'objeto', 'objetos') : 'Resultados'}</h2>
          </div>
          <ErrorNote error={results.error} onRetry={results.reload} />
          {results.loading && !results.data ? <Loading rows={4} /> : results.data?.items.length === 0 ? (
            <EmptyState title="Nada por aquí" action={activeFilters ? <button className="btn btn-sm btn-outline" onClick={clear}>Limpiar filtros</button> : null}>
              Prueba con otra zona, categoría o rango de fechas.
            </EmptyState>
          ) : (
            <div className="tag-grid">
              {results.data?.items.map((it, i) => <TagCard key={it.id} item={it} style={{ '--d': `${Math.min(i, 10) * 0.04}s` }} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
