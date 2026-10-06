import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, BellRing, CheckCircle2, XCircle, ArrowRight, Image as ImageIcon, Type, Tags } from 'lucide-react';
import { useApi, useTitle } from '../hooks/index.js';
import { post } from '../lib/api.js';
import { useMeta, useToast } from '../context/AppContext.jsx';
import { TagCard } from '../components/TagCard.jsx';
import { CopyText, Dialog, EmptyState, ErrorNote, ItemArt, Loading, PageHead, Sonar, StatusBadge } from '../components/ui.jsx';
import { dateTime, plural } from '../lib/format.js';

function Breakdown({ m }) {
  const rows = [
    [ImageIcon, 'Imagen', m.visual, 'Colores dominantes y forma de las fotos'],
    [Type, 'Texto', m.text, 'Descripción, sinónimos y palabras clave'],
    [Tags, 'Atributos', m.attr, 'Categoría, color, marca, zona y fecha'],
  ];
  return (
    <details className="why">
      <summary>¿Por qué este porcentaje?</summary>
      <dl className="why-list">
        {rows.map(([I, label, v, help]) => (
          <div key={label} className="why-row">
            <dt><I aria-hidden="true" /> {label}</dt>
            <dd>
              <span className="why-bar" aria-hidden="true"><i style={{ width: `${Math.round((v ?? 0) * 100)}%` }} /></span>
              <span className="mono">{Math.round((v ?? 0) * 100)}%</span>
              <span className="sr-only">{help}</span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default function Matches() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const item = useApi(`/items/${id}`);
  const matches = useApi(`/items/${id}/matches`);
  const [intro, setIntro] = useState(!!location.state?.fresh);
  const [closing, setClosing] = useState(false);
  useTitle(item.data ? `Coincidencias · ${item.data.item.title}` : 'Coincidencias');

  useEffect(() => {
    if (!intro) return undefined;
    const t = setTimeout(() => setIntro(false), 1300);
    return () => clearTimeout(t);
  }, [intro]);

  const rematch = async () => {
    await post(`/items/${id}/rematch`);
    matches.reload();
    toast({ title: 'Búsqueda actualizada', body: 'Volvimos a comparar con todos los hallazgos.' });
  };
  const close = async (recovered) => {
    try {
      await post(`/items/${id}/close`, { recovered });
      toast({ title: recovered ? '¡Qué bueno que apareció!' : 'Reporte cerrado', tone: 'match' });
      navigate('/inicio');
    } catch (err) { toast({ title: 'No se pudo cerrar', body: err.message, tone: 'error' }); }
  };

  if (item.error) return <div className="shell page"><ErrorNote error={item.error} /></div>;
  const it = item.data?.item;
  const list = matches.data?.matches ?? [];
  const threshold = meta ? Math.round(meta.thresholds.notify * 100) : 80;

  return (
    <div className="shell page">
      <PageHead
        eyebrow="Motor multimodal"
        title={list.length ? <>Encontramos <span className="serif">{plural(list.length, 'posible coincidencia', 'posibles coincidencias')}</span></> : <>Buscando <span className="serif">tu objeto</span></>}
        actions={it?.status === 'activo' && (
          <>
            <button className="btn btn-outline btn-sm" onClick={rematch}><RefreshCw aria-hidden="true" /> Buscar de nuevo</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setClosing(true)}>Cerrar reporte</button>
          </>
        )}
      >
        Ordenadas por porcentaje de similitud. Solo mostramos las que superan el 60 %.
      </PageHead>

      {it && (
        <section className="my-report card" aria-label="Tu reporte">
          <ItemArt item={it} className="my-report-art" />
          <div className="stack" style={{ '--gap': '6px' }}>
            <div className="row"><CopyText text={it.radicado} label="Copiar radicado" /><StatusBadge status={it.status} label={it.statusLabel} /></div>
            <strong className="my-report-title">{it.title}</strong>
            <span className="muted small">{it.categoryLabel} · {it.zoneLabel} · {dateTime(it.eventAt)}</span>
          </div>
          <p className="my-report-note"><BellRing aria-hidden="true" /> Te avisaremos por notificación y correo si aparece algo con más del {threshold} %.</p>
        </section>
      )}

      {intro || matches.loading ? (
        intro ? <Sonar label="Comparando imágenes, texto y atributos…" /> : <Loading rows={3} />
      ) : list.length === 0 ? (
        <EmptyState title="Todavía no aparece" action={<Link to="/explorar" className="btn btn-outline btn-sm">Explorar manualmente <ArrowRight aria-hidden="true" /></Link>}>
          Aún no hay hallazgos parecidos. El motor revisa cada objeto nuevo que se registre y te avisará al instante.
          Mientras tanto, puedes explorar el catálogo y el mapa del campus.
        </EmptyState>
      ) : (
        <ol className="match-list">
          {list.map((m, i) => (
            <li key={m.id} className="rise" style={{ '--d': `${i * 0.09}s` }}>
              <TagCard
                item={m.item}
                score={m.score}
                common={m.common}
                to={`/objetos/${m.item.id}?desde=${id}`}
                extra={
                  <div className="match-extra">
                    <Breakdown m={m} />
                    <Link to={`/objetos/${m.item.id}?desde=${id}`} className="btn btn-sm btn-primary">¿Es tuyo? Reclámalo <ArrowRight aria-hidden="true" /></Link>
                  </div>
                }
              />
            </li>
          ))}
        </ol>
      )}

      <Dialog open={closing} onClose={() => setClosing(false)} title="Cerrar este reporte" size="sm">
        <p>¿Cómo terminó la historia?</p>
        <div className="stack" style={{ '--gap': '10px', marginTop: 16 }}>
          <button className="btn btn-ok btn-block" onClick={() => close(true)}><CheckCircle2 aria-hidden="true" /> Lo recuperé por otro medio</button>
          <button className="btn btn-outline btn-block" onClick={() => close(false)}><XCircle aria-hidden="true" /> Ya no lo estoy buscando</button>
        </div>
      </Dialog>
    </div>
  );
}
