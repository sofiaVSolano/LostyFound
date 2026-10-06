import { Link } from 'react-router-dom';
import { SearchX, HandHeart, ArrowRight, Radar, Building2, Inbox, LayoutDashboard, PackageCheck } from 'lucide-react';
import { useAuth, useToast } from '../context/AppContext.jsx';
import { useApi, useTitle } from '../hooks/index.js';
import { post } from '../lib/api.js';
import { greeting, plural, timeAgo } from '../lib/format.js';
import { TagCard } from '../components/TagCard.jsx';
import { EmptyState, ErrorNote, Loading } from '../components/ui.jsx';

export default function Home() {
  const { user, isStaff } = useAuth();
  const toast = useToast();
  useTitle('Inicio');
  const mine = useApi('/items/mine');
  const notes = useApi('/notifications');
  const awaiting = useApi(isStaff ? '/admin/awaiting' : null);
  const g = greeting(user.name);

  const lost = mine.data?.items.filter((i) => i.kind === 'lost') ?? [];
  const found = mine.data?.items.filter((i) => i.kind === 'found') ?? [];
  const activeLost = lost.filter((i) => i.status === 'activo');

  const checkIn = async (item) => {
    try {
      await post(`/items/${item.id}/check-in`);
      toast({ title: 'Registrado en custodia', body: `${item.title} ahora está en la oficina. ¡Gracias!`, tone: 'match' });
      mine.reload();
      awaiting.reload?.();
    } catch (err) { toast({ title: 'No se pudo registrar', body: err.message, tone: 'error' }); }
  };

  return (
    <div className="shell page home">
      <header className="home-hero">
        <div>
          <span className="eyebrow">{user.alias}</span>
          <h1 tabIndex={-1} className="page-title">{g.hello}.</h1>
          <p className="page-lead">{g.line}</p>
        </div>
        <div className="quick">
          <Link to="/reportar/perdido" className="quick-card quick-lost">
            <SearchX aria-hidden="true" />
            <span><strong>Perdí algo</strong><small>El motor busca entre todos los hallazgos</small></span>
            <ArrowRight aria-hidden="true" className="quick-arrow" />
          </Link>
          <Link to="/reportar/encontrado" className="quick-card quick-found">
            <HandHeart aria-hidden="true" />
            <span><strong>Encontré algo</strong><small>Recibe un radicado y ayuda a devolverlo</small></span>
            <ArrowRight aria-hidden="true" className="quick-arrow" />
          </Link>
        </div>
      </header>

      {activeLost.some((i) => i.matchCount > 0) && (
        <section className="match-banner rise" aria-label="Coincidencias">
          <Radar aria-hidden="true" className="match-banner-ico" />
          <div>
            <strong>Tenemos posibles coincidencias para ti</strong>
            <p>{activeLost.filter((i) => i.matchCount > 0).map((i) => `${i.title} (${Math.round(i.bestScore * 100)} %)`).join(' · ')}</p>
          </div>
          <Link className="btn btn-primary btn-sm" to={`/coincidencias/${activeLost.find((i) => i.matchCount > 0).id}`}>Ver ahora</Link>
        </section>
      )}

      {isStaff && (
        <section className="staff-strip" aria-labelledby="staff-title">
          <h2 id="staff-title" className="sr-only">Accesos del personal</h2>
          <Link to="/admin" className="staff-link"><LayoutDashboard aria-hidden="true" /> Panel de métricas</Link>
          <Link to="/admin/custodia" className="staff-link"><Building2 aria-hidden="true" /> Custodia</Link>
          <Link to="/reclamos" className="staff-link"><Inbox aria-hidden="true" /> Reclamos por revisar</Link>
          <Link to="/escanear" className="staff-link"><PackageCheck aria-hidden="true" /> Escanear entrega</Link>
        </section>
      )}

      {isStaff && awaiting.data?.items.length > 0 && (
        <section className="home-section" aria-labelledby="await-title">
          <div className="spread">
            <h2 id="await-title">Por recibir en la oficina</h2>
            <span className="badge badge-cyan">{awaiting.data.items.length}</span>
          </div>
          <p className="muted">Objetos que siguen en manos de quien los encontró. Al recibirlos se registra la fecha de ingreso a custodia.</p>
          <div className="tag-grid">
            {awaiting.data.items.map((it) => (
              <TagCard key={it.id} item={it} extra={<button className="btn btn-sm btn-outline tag-action" onClick={() => checkIn(it)}>Recibir en oficina</button>} />
            ))}
          </div>
        </section>
      )}

      <div className="home-grid">
        <section className="home-section" aria-labelledby="lost-title">
          <div className="spread">
            <h2 id="lost-title">Lo que estás buscando</h2>
            <span className="muted">{plural(activeLost.length, 'activo', 'activos')}</span>
          </div>
          <ErrorNote error={mine.error} onRetry={mine.reload} />
          {mine.loading ? <Loading rows={2} /> : lost.length === 0 ? (
            <EmptyState title="Nada perdido por ahora" action={<Link to="/reportar/perdido" className="btn btn-sm btn-outline">Reportar una pérdida</Link>}>
              Ojalá siga así. Si algo se te pierde, repórtalo y te avisamos al encontrar coincidencias.
            </EmptyState>
          ) : (
            <div className="tag-list">
              {lost.map((it, i) => (
                <TagCard
                  key={it.id} item={it} style={{ '--d': `${i * 0.05}s` }}
                  to={it.status === 'activo' ? `/coincidencias/${it.id}` : `/objetos/${it.id}`}
                  extra={it.status === 'activo' && (
                    <span className={`match-pill ${it.matchCount ? 'has' : ''}`}>
                      <Radar aria-hidden="true" />
                      {it.matchCount ? `${plural(it.matchCount, 'coincidencia', 'coincidencias')} · mejor ${Math.round(it.bestScore * 100)} %` : 'El motor sigue buscando…'}
                    </span>
                  )}
                />
              ))}
            </div>
          )}
        </section>

        <section className="home-section" aria-labelledby="found-title">
          <div className="spread">
            <h2 id="found-title">Lo que encontraste</h2>
            <span className="muted">{plural(found.length, 'reporte', 'reportes')}</span>
          </div>
          {mine.loading ? <Loading rows={2} /> : found.length === 0 ? (
            <EmptyState title="Aún no registras hallazgos" art="card" action={<Link to="/reportar/encontrado" className="btn btn-sm btn-outline">Registrar un hallazgo</Link>}>
              Cada objeto que reportas es un susto menos para alguien.
            </EmptyState>
          ) : (
            <div className="tag-list">
              {found.map((it) => (
                <TagCard
                  key={it.id} item={it}
                  extra={
                    <div className="row" style={{ '--gap': '8px' }}>
                      {it.pendingClaims > 0 && <Link to="/reclamos" className="badge badge-warn">{plural(it.pendingClaims, 'reclamo por revisar', 'reclamos por revisar')}</Link>}
                      {it.status === 'en_espera_entrega' && (
                        <button className="btn btn-sm btn-outline tag-action" onClick={() => checkIn(it)}>Ya lo entregué en portería</button>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="home-section" aria-labelledby="act-title">
        <div className="spread">
          <h2 id="act-title">Actividad reciente</h2>
          <Link to="/notificaciones" className="linkish">Ver todo</Link>
        </div>
        {notes.data?.notifications.length ? (
          <ul className="activity">
            {notes.data.notifications.slice(0, 4).map((n) => (
              <li key={n.id} className={n.read ? '' : 'is-unread'}>
                <span className={`act-dot act-${n.type}`} aria-hidden="true" />
                <div>
                  {n.link ? <Link to={n.link}><strong>{n.title}</strong></Link> : <strong>{n.title}</strong>}
                  <p className="muted">{n.body}</p>
                </div>
                <time className="muted small" dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Sin novedades. Te avisaremos en cuanto pase algo.</p>}
      </section>
    </div>
  );
}
