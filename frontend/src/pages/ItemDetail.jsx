import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  MapPin, CalendarClock, Tag, Palette, User2, ShieldQuestion, Send, MessagesSquare, QrCode, Clock, CheckCircle2,
  XCircle, Building2, Radar, Lock, Hourglass,
} from 'lucide-react';
import { useAuth, useMeta, useToast } from '../context/AppContext.jsx';
import { useApi, useTitle } from '../hooks/index.js';
import { post } from '../lib/api.js';
import { dateTime, timeAgo } from '../lib/format.js';
import { CopyText, ErrorNote, ItemArt, Loading, ScoreRing, StatusBadge, WaterTank, Field } from '../components/ui.jsx';
import { Timeline } from '../components/Timeline.jsx';
import { CampusMap } from '../components/CampusMap.jsx';

function Gallery({ item }) {
  const [idx, setIdx] = useState(0);
  if (!item.photos.length) return <ItemArt item={item} className="gallery-main" eager />;
  return (
    <div className="gallery">
      <div className="gallery-main item-art">
        <img src={item.photos[idx]} alt={`Foto ${idx + 1} de ${item.photos.length}: ${item.title}`} />
      </div>
      {item.photos.length > 1 && (
        <div className="gallery-thumbs" role="group" aria-label="Fotos">
          {item.photos.map((p, i) => (
            <button key={p} className="gallery-thumb" aria-pressed={i === idx} onClick={() => setIdx(i)} aria-label={`Ver foto ${i + 1}`}>
              <img src={p} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimBox({ item, lostId, onDone }) {
  const toast = useToast();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = useApi('/items/mine');
  const myLost = mine.data?.items.filter((i) => i.kind === 'lost' && i.status === 'activo') ?? [];
  const [link, setLink] = useState(lostId ?? '');

  const submit = async (e) => {
    e.preventDefault();
    if (answer.trim().length < 2) { setError('Escribe tu respuesta.'); return; }
    setBusy(true);
    try {
      await post('/claims', { itemId: item.id, answer, lostId: link || undefined });
      toast({ title: 'Solicitud enviada', body: 'Quien lo custodia revisará tu respuesta. Te avisaremos apenas decida.', tone: 'match' });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form className="claim-box card card-pad" onSubmit={submit} noValidate>
      <h2><ShieldQuestion aria-hidden="true" /> ¿Es tuyo? Demuéstralo</h2>
      <p className="claim-question">
        {item.securityQuestion ?? 'Describe un detalle que solo el dueño conocería (algo que no se vea en la foto).'}
      </p>
      <Field label="Tu respuesta" error={error}>
        {(p) => <textarea {...p} className="textarea" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={300} placeholder="Sé específico: colores, marcas, contenido…" />}
      </Field>
      {myLost.length > 0 && (
        <Field label="Vincular con mi reporte de pérdida" optional hint="Así lo marcamos como recuperado al entregártelo.">
          {(p) => (
            <select {...p} className="select" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">Sin vincular</option>
              {myLost.map((l) => <option key={l.id} value={l.id}>{l.title} · {l.radicado}</option>)}
            </select>
          )}
        </Field>
      )}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <span className="spinner" aria-hidden="true" /> : <Send aria-hidden="true" />} Enviar para verificación</button>
      <p className="muted small"><Lock aria-hidden="true" className="inline-ico" /> Tu identidad se mantiene privada: quien encontró el objeto solo verá tu alias.</p>
    </form>
  );
}

function ClaimStatus({ claim }) {
  if (claim.status === 'pending') return <div className="claim-state card card-pad"><Hourglass aria-hidden="true" /><div><strong>Tu solicitud está en revisión</strong><p className="muted">Enviada {timeAgo(claim.created_at)}. Te avisaremos cuando quien lo custodia decida.</p></div></div>;
  if (claim.status === 'approved') return (
    <div className="claim-state card card-pad is-ok">
      <CheckCircle2 aria-hidden="true" />
      <div className="stack" style={{ '--gap': '10px' }}>
        <strong>¡Verificación aprobada!</strong>
        <p className="muted">Coordina la entrega en el chat anónimo y muestra tu QR al recibirlo.</p>
        <div className="row">
          <Link to={`/chat/${claim.id}`} className="btn btn-sm btn-outline"><MessagesSquare aria-hidden="true" /> Abrir chat</Link>
          <Link to={`/entrega/${claim.id}`} className="btn btn-sm btn-primary"><QrCode aria-hidden="true" /> Mostrar QR de entrega</Link>
        </div>
      </div>
    </div>
  );
  if (claim.status === 'delivered') return <div className="claim-state card card-pad is-ok"><CheckCircle2 aria-hidden="true" /><div><strong>¡Ya lo recuperaste!</strong><p className="muted">La entrega quedó registrada en el historial inmutable.</p></div></div>;
  return null;
}

function ReviewList({ item, onChange }) {
  const toast = useToast();
  const decide = async (claim, approve) => {
    try {
      await post(`/claims/${claim.id}/decide`, { approve });
      toast({ title: approve ? 'Reclamo aprobado' : 'Reclamo rechazado', body: approve ? 'Se abrió el chat anónimo para coordinar la entrega.' : 'Le avisamos a la persona.', tone: approve ? 'match' : 'info' });
      onChange();
    } catch (err) { toast({ title: 'No se pudo decidir', body: err.message, tone: 'error' }); }
  };
  if (!item.claims?.length) return null;
  return (
    <section className="card card-pad review" aria-labelledby="review-title">
      <h2 id="review-title">Solicitudes de reclamo</h2>
      {item.securityDetail && <p className="expected"><Lock aria-hidden="true" /> Respuesta esperada: <strong>{item.securityDetail}</strong></p>}
      <ul className="review-list">
        {item.claims.map((c) => (
          <li key={c.id} className={`review-item st-${c.status}`}>
            <div>
              <strong>{c.claimant_alias}</strong> <span className="muted small">· {timeAgo(c.created_at)}</span>
              <blockquote>“{c.answer}”</blockquote>
            </div>
            {c.status === 'pending' ? (
              <div className="row" style={{ '--gap': '8px' }}>
                <button className="btn btn-sm btn-ok" onClick={() => decide(c, true)} disabled={!['en_custodia', 'en_espera_entrega'].includes(item.status)}><CheckCircle2 aria-hidden="true" /> Aprobar</button>
                <button className="btn btn-sm btn-danger" onClick={() => decide(c, false)}><XCircle aria-hidden="true" /> Rechazar</button>
              </div>
            ) : (
              <span className={`badge ${c.status === 'rejected' ? 'badge-danger' : 'badge-ok'}`}>
                {{ approved: 'Aprobado', rejected: 'Rechazado', delivered: 'Entregado' }[c.status]}
              </span>
            )}
            {c.status === 'approved' && <Link className="btn btn-sm btn-outline" to={`/chat/${c.id}`}><MessagesSquare aria-hidden="true" /> Chat</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ItemDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const meta = useMeta();
  const { isStaff } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/items/${id}`);
  useTitle(data?.item.title ?? 'Objeto');

  if (error) return <div className="shell page"><ErrorNote error={error} /><Link to="/explorar" className="btn btn-outline">Volver a explorar</Link></div>;
  if (loading || !data) return <div className="shell page"><Loading rows={3} /></div>;
  const it = data.item;
  const color = it.color && meta?.colorById[it.color];

  const checkIn = async () => {
    try { await post(`/items/${it.id}/check-in`); toast({ title: 'Ingresado a custodia', tone: 'match' }); reload(); }
    catch (err) { toast({ title: 'Error', body: err.message, tone: 'error' }); }
  };

  return (
    <div className="shell page detail">
      <nav className="crumbs" aria-label="Ruta de navegación">
        <Link to={it.kind === 'lost' ? '/inicio' : '/explorar'}>{it.kind === 'lost' ? 'Mis reportes' : 'Explorar'}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{it.radicado}</span>
      </nav>

      <div className="detail-layout">
        <div className="detail-media">
          <Gallery item={it} />
          {it.dominant?.length > 0 && (
            <div className="palette-strip" aria-label="Tonos dominantes detectados en la foto">
              {it.dominant.map((h) => <span key={h} style={{ background: h }} title={h} />)}
            </div>
          )}
        </div>

        <div className="detail-info">
          <div className="row"><CopyText text={it.radicado} label="Copiar radicado" /><StatusBadge status={it.status} label={it.statusLabel} /></div>
          <h1 tabIndex={-1} className="detail-title">{it.title}</h1>
          {it.description && <p className="detail-desc">{it.description}</p>}

          {it.myMatch && (
            <div className="my-match">
              <ScoreRing value={it.myMatch.score} size={88} stroke={8} />
              <div>
                <strong>Coincide con tu reporte</strong>
                <ul className="tag-common">{it.myMatch.common.map((c) => <li key={c.label}>{c.label}</li>)}</ul>
              </div>
            </div>
          )}

          <dl className="facts">
            <div><dt><Tag aria-hidden="true" /> Categoría</dt><dd>{it.categoryLabel}</dd></div>
            {color && <div><dt><Palette aria-hidden="true" /> Color</dt><dd><span className="dot" style={{ background: color.hex ?? 'conic-gradient(#f44,#fd4,#4d8,#4af,#a5f,#f44)' }} aria-hidden="true" /> {color.label}</dd></div>}
            {it.brand && <div><dt><Tag aria-hidden="true" /> Marca</dt><dd>{it.brand}</dd></div>}
            <div><dt><MapPin aria-hidden="true" /> {it.kind === 'lost' ? 'Se perdió en' : 'Encontrado en'}</dt><dd>{it.zoneLabel}{it.locationDetail && <span className="muted"> · {it.locationDetail}</span>}</dd></div>
            <div><dt><CalendarClock aria-hidden="true" /> Fecha</dt><dd>{dateTime(it.eventAt)}</dd></div>
            {it.kind === 'found' && <div><dt><Building2 aria-hidden="true" /> Ubicación actual</dt><dd>{it.custodyMode === 'office' ? 'Oficina de Objetos Perdidos' : 'Con quien lo encontró'}</dd></div>}
            <div><dt><User2 aria-hidden="true" /> Reportado por</dt><dd>{it.isOwner ? 'Ti' : it.reporterAlias}</dd></div>
          </dl>

          {it.custody && (
            <div className="custody-box">
              <WaterTank days={it.custody.days} max={it.custody.max} state={it.custody.state} />
              <div>
                <strong>Tiempo en custodia</strong>
                <p className="muted small">Ingresó {dateTime(it.custodyAt)}. {it.policyName && <>Política: <strong>{it.policyName}</strong>{it.custody.policyDaysLeft != null && (it.custody.policyDaysLeft > 0 ? ` · vence en ${it.custody.policyDaysLeft} días` : ' · cumplida')}.</>}</p>
              </div>
            </div>
          )}

          {it.kind === 'found' && it.status === 'en_espera_entrega' && (it.isOwner || isStaff) && (
            <button className="btn btn-outline" onClick={checkIn}><Building2 aria-hidden="true" /> {isStaff ? 'Recibir en oficina' : 'Ya lo entregué en portería'}</button>
          )}
          {it.kind === 'lost' && it.isOwner && it.status === 'activo' && (
            <Link to={`/coincidencias/${it.id}`} className="btn btn-primary"><Radar aria-hidden="true" /> Ver coincidencias</Link>
          )}

          {it.myClaim && it.myClaim.status !== 'rejected' && <ClaimStatus claim={it.myClaim} />}
          {it.myClaim?.status === 'rejected' && it.canClaim && <p className="muted small">Tu respuesta anterior no fue aprobada. Puedes intentarlo una vez más.</p>}
          {it.canClaim && <ClaimBox item={it} lostId={params.get('desde')} onDone={reload} />}
        </div>
      </div>

      {(it.isOwner || isStaff) && <ReviewList item={it} onChange={reload} />}

      <div className="detail-bottom">
        <section className="card card-pad" aria-labelledby="hist-title">
          <h2 id="hist-title"><Clock aria-hidden="true" className="inline-ico" /> Historial</h2>
          <p className="muted small">Cada evento está sellado con un hash encadenado al anterior: no se puede editar ni borrar.</p>
          <Timeline events={it.history} />
        </section>
        <section className="card card-pad" aria-labelledby="where-title">
          <h2 id="where-title"><MapPin aria-hidden="true" className="inline-ico" /> En el mapa</h2>
          <CampusMap mode="pick" selected={it.zone} label={`Ubicación: ${it.zoneLabel}`} />
        </section>
      </div>
    </div>
  );
}
