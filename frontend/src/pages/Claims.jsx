import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessagesSquare, QrCode, CheckCircle2, XCircle, Lock, ScanLine } from 'lucide-react';
import { useApi, useTitle } from '../hooks/index.js';
import { useRealtime, useToast } from '../context/AppContext.jsx';
import { post } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { EmptyState, ErrorNote, ItemArt, Loading, PageHead, TabPanel, Tabs } from '../components/ui.jsx';

const STATUS = {
  pending: ['En revisión', 'warn'],
  approved: ['Aprobado · coordina la entrega', 'ok'],
  rejected: ['No aprobado', 'danger'],
  delivered: ['Entregado', 'ok'],
};

function ClaimCard({ c, onDecide, highlight }) {
  const [label, tone] = STATUS[c.status];
  return (
    <article className={`claim-card card ${highlight ? 'is-highlight' : ''}`} id={`claim-${c.id}`}>
      <ItemArt item={c.item} className="claim-art" />
      <div className="claim-main">
        <div className="spread">
          <Link to={`/objetos/${c.item.id}`} className="claim-title">{c.item.title}</Link>
          <span className={`badge badge-${tone}`}>{label}</span>
        </div>
        <p className="muted small">
          {c.role === 'claimant' ? <>Custodia: {c.finderAlias}</> : <>Reclama: <strong>{c.claimantAlias}</strong></>} · {timeAgo(c.createdAt)} · <span className="mono">{c.item.radicado}</span>
        </p>
        {c.answer && (
          <div className="claim-qa">
            {c.item.securityQuestion && <span className="muted small">{c.item.securityQuestion}</span>}
            <blockquote>“{c.answer}”</blockquote>
            {c.role !== 'claimant' && c.item.securityDetail && (
              <span className="expected small"><Lock aria-hidden="true" /> Esperada: <strong>{c.item.securityDetail}</strong></span>
            )}
          </div>
        )}
        <div className="row claim-actions">
          {c.canDecide && (
            <>
              <button className="btn btn-sm btn-ok" onClick={() => onDecide(c, true)}><CheckCircle2 aria-hidden="true" /> Aprobar</button>
              <button className="btn btn-sm btn-danger" onClick={() => onDecide(c, false)}><XCircle aria-hidden="true" /> Rechazar</button>
            </>
          )}
          {(c.status === 'approved' || c.status === 'delivered') && (
            <Link to={`/chat/${c.id}`} className="btn btn-sm btn-outline"><MessagesSquare aria-hidden="true" /> {c.chat.open ? 'Chat anónimo' : 'Ver chat'}</Link>
          )}
          {c.status === 'approved' && c.role === 'claimant' && <Link to={`/entrega/${c.id}`} className="btn btn-sm btn-primary"><QrCode aria-hidden="true" /> Mi QR de entrega</Link>}
          {c.status === 'approved' && c.role !== 'claimant' && <Link to="/escanear" className="btn btn-sm btn-primary"><ScanLine aria-hidden="true" /> Escanear QR</Link>}
        </div>
      </div>
    </article>
  );
}

export default function Claims() {
  useTitle('Reclamos');
  const toast = useToast();
  const { on } = useRealtime();
  const [params] = useSearchParams();
  const open = Number(params.get('abrir')) || null;
  const { data, error, loading, reload } = useApi('/claims');
  const pendingReview = data?.toReview.filter((c) => c.canDecide).length ?? 0;
  const [tab, setTab] = useState(open ? 'review' : 'mine');

  useEffect(() => on('claim', reload), [on, reload]);
  useEffect(() => on('notification', (n) => n.type === 'claim' && reload()), [on, reload]);
  useEffect(() => {
    if (!data || !open) return;
    if (data.mine.some((c) => c.id === open)) setTab('mine');
    requestAnimationFrame(() => document.getElementById(`claim-${open}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [data, open]);

  const decide = async (c, approve) => {
    try {
      await post(`/claims/${c.id}/decide`, { approve });
      toast({ title: approve ? 'Reclamo aprobado' : 'Reclamo rechazado', body: approve ? 'Abrimos el chat anónimo para coordinar la entrega.' : 'Le avisamos a la persona.', tone: approve ? 'match' : 'info' });
      reload();
    } catch (err) { toast({ title: 'No se pudo decidir', body: err.message, tone: 'error' }); }
  };

  return (
    <div className="shell page">
      <PageHead eyebrow="Verificación de propiedad" title={<>Reclamos y <span className="serif">devoluciones</span></>}>
        Las solicitudes se validan con la pregunta de seguridad. Al aprobarse se abre un chat anónimo temporal.
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      <Tabs
        label="Tipo de reclamo" value={tab} onChange={setTab}
        tabs={[
          { id: 'mine', label: 'Mis solicitudes', count: data?.mine.length },
          { id: 'review', label: 'Por revisar', count: pendingReview || undefined },
        ]}
      />
      {loading && !data ? <Loading rows={3} /> : (
        <TabPanel id={tab}>
          {tab === 'mine' ? (
            data?.mine.length ? <div className="stack">{data.mine.map((c) => <ClaimCard key={c.id} c={c} onDecide={decide} highlight={c.id === open} />)}</div>
              : <EmptyState title="No has reclamado objetos">Cuando encuentres algo tuyo en el catálogo, responde su pregunta de seguridad desde el detalle.</EmptyState>
          ) : (
            data?.toReview.length ? <div className="stack">{data.toReview.map((c) => <ClaimCard key={c.id} c={c} onDecide={decide} highlight={c.id === open} />)}</div>
              : <EmptyState title="Nada por revisar" art="card">Cuando alguien reclame un objeto que encontraste, aparecerá aquí para que apruebes o rechaces.</EmptyState>
          )}
        </TabPanel>
      )}
    </div>
  );
}
