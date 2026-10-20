import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HeartHandshake, Trash2, Timer, Recycle, Info, Award } from 'lucide-react';
import { useApi, useTitle } from '../../hooks/index.js';
import { useAuth, useMeta, useToast } from '../../context/AppContext.jsx';
import { post } from '../../lib/api.js';
import { dateShort, plural } from '../../lib/format.js';
import { Dialog, EmptyState, ErrorNote, ItemArt, Loading, PageHead, StatusBadge, TabPanel, Tabs, WaterTank } from '../../components/ui.jsx';
import { AdminNav } from '../../components/admin.jsx';

const STATE_BADGE = { ok: ['En plazo', 'ok'], proximo: ['Por vencer', 'warn'], vencido: ['Vencido', 'danger'] };

export default function Custody() {
  useTitle('Custodia');
  const meta = useMeta();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const state = params.get('estado') ?? 'all';
  const [category, setCategory] = useState('');
  const { data, error, loading, reload } = useApi(`/admin/custody?state=${state}${category ? `&category=${category}` : ''}`);
  const policies = useApi('/admin/policies');
  const [protocol, setProtocol] = useState(null);
  const receptions = useApi('/rewards/receptions');
  const [confirming, setConfirming] = useState(null);

  // HU-18 CA1: confirmar la recepción física otorga los puntos de Cazador a quien entregó el objeto
  const confirmReception = async (item) => {
    setConfirming(item.id);
    try {
      const { award } = await post(`/rewards/receptions/${item.id}`);
      toast({ title: 'Recepción confirmada', body: award ? `${item.reporterAlias} sumó ${award.points} puntos (${award.total} en total).` : item.title, tone: 'match' });
      receptions.reload();
    } catch (err) { toast({ title: 'No se pudo confirmar', body: err.message, tone: 'error' }); }
    finally { setConfirming(null); }
  };

  const setPolicy = async (item, policyId) => {
    try {
      await post(`/admin/items/${item.id}/policy`, { policyId: policyId || null });
      toast({ title: 'Política actualizada', body: item.title });
      reload();
    } catch (err) { toast({ title: 'No se pudo actualizar', body: err.message, tone: 'error' }); }
  };

  const startProtocol = async (kind) => {
    try {
      await post(`/admin/items/${protocol.id}/disposition`, { protocol: kind });
      toast({ title: 'Protocolo iniciado', body: `${protocol.title} pasó a “En protocolo de disposición”.`, tone: 'match' });
      setProtocol(null);
      reload();
    } catch (err) { toast({ title: 'No se pudo iniciar', body: err.message, tone: 'error' }); }
  };

  const items = data?.items ?? [];

  return (
    <div className="shell page admin">
      <AdminNav />
      <PageHead eyebrow="HU-11 · HU-12 · HU-18" title={<>Tiempo en <span className="serif">custodia</span></>}>
        La fecha de ingreso se registra automáticamente. El tanque se llena hasta los {data?.maxDays ?? 90} días o hasta que vence la política del objeto.
      </PageHead>

      {receptions.data?.items.length > 0 && (
        <section className="card card-pad receptions" aria-labelledby="h-receptions">
          <h2 id="h-receptions"><Award aria-hidden="true" className="inline-ico" /> Entregas por confirmar · Cazadores de Objetos</h2>
          <p className="muted small">
            {plural(receptions.data.items.length, 'objeto fue reportado', 'objetos fueron reportados')} como entregado en la oficina por la comunidad.
            Confirma que lo recibiste físicamente para otorgar los puntos.
          </p>
          <ul className="reception-list">
            {receptions.data.items.map((it) => (
              <li key={it.id} className="reception-row">
                <ItemArt item={it} className="reception-art" />
                <span className="grow">
                  <Link to={`/objetos/${it.id}`}><strong>{it.title}</strong></Link>
                  <span className="muted small"><span className="mono">{it.radicado}</span> · entregado por {it.reporterAlias} · {dateShort(it.custodyAt ?? it.createdAt)}</span>
                </span>
                <button className="btn btn-sm btn-primary" disabled={confirming === it.id} onClick={() => confirmReception(it)}>
                  {confirming === it.id && <span className="spinner" aria-hidden="true" />} Confirmar recepción
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="spread">
        <Tabs
          label="Filtrar por estado de custodia" value={state} onChange={(v) => setParams(v === 'all' ? {} : { estado: v })}
          tabs={[
            { id: 'all', label: 'Todos' },
            { id: 'proximo', label: 'Por vencer' },
            { id: 'vencido', label: 'Vencidos' },
            { id: 'policy', label: 'Política cumplida' },
          ]}
        />
        {meta && (
          <label className="inline-select">
            <span className="sr-only">Categoría</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <ErrorNote error={error} onRetry={reload} />
      <TabPanel id={state}>
        {loading && !data ? <Loading rows={4} /> : items.length === 0 ? (
          <EmptyState title="Sin objetos en esta vista" art="card">Cuando un objeto cumpla la condición aparecerá aquí, y recibirás una alerta automática.</EmptyState>
        ) : (
          <ul className="custody-list">
            {items.map((it) => {
              const [label, tone] = STATE_BADGE[it.custody.state];
              return (
                <li key={it.id} className={`custody-row card st-${it.custody.state}`}>
                  <WaterTank days={it.custody.days} max={it.custody.max} state={it.custody.state} />
                  <ItemArt item={it} className="custody-art" />
                  <div className="custody-main">
                    <div className="row" style={{ '--gap': '8px' }}>
                      <Link to={`/objetos/${it.id}`} className="custody-title">{it.title}</Link>
                      <span className={`badge badge-${tone}`}>{label}</span>
                      <StatusBadge status={it.status} label={it.statusLabel} />
                    </div>
                    <p className="muted small"><span className="mono">{it.radicado}</span> · {it.categoryLabel} · ingresó el {dateShort(it.custodyAt)} · <strong>{it.custody.days} días</strong></p>
                    <div className="row custody-policy">
                      <Timer aria-hidden="true" />
                      <label>
                        <span className="sr-only">Política de vencimiento de {it.title}</span>
                        <select className="select select-sm" value={it.policyId ?? ''} onChange={(e) => setPolicy(it, e.target.value)}>
                          <option value="">Sin política</option>
                          {policies.data?.policies.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.days} d</option>)}
                        </select>
                      </label>
                      {it.policyDeadline && (
                        <span className={`small ${it.custody.policyExpired ? 'text-danger' : 'muted'}`}>
                          {it.custody.policyExpired ? `Venció el ${dateShort(it.policyDeadline)}` : `Vence el ${dateShort(it.policyDeadline)} (${it.custody.policyDaysLeft} d)`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="custody-actions">
                    {isAdmin && it.status === 'en_custodia' && it.custody.state === 'vencido' && (
                      <button className="btn btn-sm btn-primary" onClick={() => setProtocol(it)}>Iniciar protocolo</button>
                    )}
                    {it.custody.state === 'vencido' && it.status !== 'clasificado_reciclaje' && (
                      <Link className="btn btn-sm btn-outline" to="/admin/reciclaje"><Recycle aria-hidden="true" /> Clasificar</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </TabPanel>

      <p className="note"><Info aria-hidden="true" /> Las alertas se generan automáticamente cada 10 minutos y llegan como notificación a la administración.</p>

      <Dialog open={!!protocol} onClose={() => setProtocol(null)} title="Protocolo institucional" size="sm">
        {protocol && (
          <div className="stack">
            <p><strong>{protocol.title}</strong> lleva {protocol.custody.days} días en custodia sin ser reclamado. ¿Qué protocolo deseas iniciar?</p>
            <button className="choice-card as-button" onClick={() => startProtocol('donacion')}>
              <HeartHandshake aria-hidden="true" /><strong>Donación</strong><small>Para objetos en buen estado: prendas, útiles, termos.</small>
            </button>
            <button className="choice-card as-button" onClick={() => startProtocol('disposicion_final')}>
              <Trash2 aria-hidden="true" /><strong>Disposición final / reciclaje</strong><small>Se clasificará por material y se asignará a una empresa vinculada.</small>
            </button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
