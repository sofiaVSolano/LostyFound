import { Link } from 'react-router-dom';
import { SearchX, ShieldCheck, ShieldAlert, AlertTriangle, ArrowRight, Clock, Boxes, Inbox, Recycle } from 'lucide-react';
import { useApi, useCountUp, useTitle } from '../../hooks/index.js';
import { ErrorNote, Loading, PageHead } from '../../components/ui.jsx';
import { AdminNav, GroupedBars } from '../../components/admin.jsx';
import { hoursLabel, num } from '../../lib/format.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function Hero({ rate }) {
  const n = useCountUp(rate * 100, 1400);
  return (
    <div className="kpi-hero card">
      <span className="eyebrow">Tasa de éxito en devoluciones</span>
      <strong className="kpi-hero-num">{Math.round(n)}<small>%</small></strong>
      <div className="kpi-bar" aria-hidden="true"><i style={{ width: `${rate * 100}%` }} /></div>
      <span className="muted small">de los objetos encontrados volvieron con su dueño</span>
    </div>
  );
}

export default function Dashboard() {
  useTitle('Panel de métricas');
  const { data, error, loading, reload } = useApi('/admin/stats');

  return (
    <div className="shell page admin">
      <AdminNav />
      <PageHead eyebrow="Punto de atención" title={<>Métricas e <span className="serif">historial</span></>}>
        Auditoría de la gestión de pertenencias del campus.
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      {loading || !data ? <Loading rows={3} /> : (
        <>
          {(data.custody.overdue > 0 || data.custody.soon > 0) && (
            <div className="alert-strip">
              <AlertTriangle aria-hidden="true" />
              <p>
                <strong>{data.custody.overdue} {data.custody.overdue === 1 ? 'objeto superó' : 'objetos superaron'} los {data.custody.max} días</strong> en custodia
                {data.custody.soon > 0 && <> y {data.custody.soon} {data.custody.soon === 1 ? 'está por cumplirlos' : 'están por cumplirlos'}</>}. Puedes iniciar el protocolo de donación o disposición.
              </p>
              <Link className="btn btn-sm btn-outline" to="/admin/custodia?estado=vencido">Revisar <ArrowRight aria-hidden="true" /></Link>
            </div>
          )}

          <div className="kpis">
            <Hero rate={data.successRate} />
            <div className="kpi card"><Clock aria-hidden="true" /><span className="muted small">Tiempo promedio de reclamación</span><strong>{hoursLabel(data.avgClaimHours)}</strong></div>
            <div className="kpi card"><Boxes aria-hidden="true" /><span className="muted small">En custodia ahora</span><strong>{num(data.totals.inCustody)}</strong></div>
            <div className="kpi card"><Inbox aria-hidden="true" /><span className="muted small">Reclamos pendientes</span><strong>{num(data.totals.pendingClaims)}</strong></div>
            <div className="kpi card"><SearchX aria-hidden="true" /><span className="muted small">Reportes de pérdida</span><strong>{num(data.totals.lost)}</strong></div>
            <div className="kpi card"><Recycle aria-hidden="true" /><span className="muted small">Reciclados</span><strong>{num(data.recycled)}</strong></div>
            <div className={`kpi card chain ${data.chain.ok ? 'is-ok' : 'is-broken'}`}>
              {data.chain.ok ? <ShieldCheck aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
              <span className="muted small">Historial inmutable</span>
              <strong>{data.chain.ok ? 'Íntegro' : `Alterado en #${data.chain.brokenAt}`}</strong>
              <span className="muted small">{num(data.chain.count)} eventos sellados</span>
            </div>
          </div>

          <div className="charts">
            <GroupedBars
              title="Volumen por categoría"
              description="Reportes de pérdida y hallazgos registrados por categoría."
              horizontal
              data={data.byCategory}
              series={[{ key: 'found', label: 'Encontrados', color: '--series-1' }, { key: 'lost', label: 'Perdidos', color: '--series-2' }]}
            />
            <GroupedBars
              title="Tendencia de los últimos 6 meses"
              description="Objetos encontrados frente a devoluciones confirmadas por mes."
              labelKey="month"
              formatLabel={(m) => MONTHS[Number(m.slice(5, 7)) - 1]}
              data={data.months}
              series={[{ key: 'found', label: 'Encontrados', color: '--series-1' }, { key: 'returned', label: 'Devueltos', color: '--series-2' }]}
            />
          </div>

          <section className="card card-pad" aria-labelledby="st-title">
            <h2 id="st-title" className="h3">Objetos encontrados por estado</h2>
            <ul className="status-break">
              {data.statusBreakdown.sort((a, b) => b.n - a.n).map((s) => (
                <li key={s.status}>
                  <span>{s.label}</span>
                  <span className="sb-bar" aria-hidden="true"><i style={{ width: `${(s.n / data.totals.found) * 100}%` }} /></span>
                  <strong className="mono">{s.n}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
