import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Award, ShieldPlus, UtensilsCrossed, Printer, Lock, QrCode, RefreshCw, HandHeart, Ticket, CircleCheck, Info } from 'lucide-react';
import { api, post } from '../lib/api.js';
import { useRealtime, useToast } from '../context/AppContext.jsx';
import { useApi, useTitle, useWakeLock } from '../hooks/index.js';
import { dateShort, dateTime, plural } from '../lib/format.js';
import { CopyText, Dialog, EmptyState, ErrorNote, Loading, PageHead } from '../components/ui.jsx';

const BENEFIT_ICON = { seguro: ShieldPlus, alimentos: UtensilsCrossed, impresiones: Printer };
const TX_LABEL = { earn: 'Entrega confirmada', coupon_issued: 'Cupón generado', coupon_used: 'Cupón redimido' };

/** HU-20 CA1: QR dinámico del cupón, renovado cada 30 s, para mostrar en la tienda o servicio. */
function CouponQR({ coupon, onUsed }) {
  const canvasRef = useRef(null);
  const [tok, setTok] = useState(null);
  const [left, setLeft] = useState(30);
  const [error, setError] = useState(null);
  const { on } = useRealtime();
  useWakeLock(true);

  useEffect(() => {
    let timer;
    let alive = true;
    const load = async () => {
      try {
        const t = await api(`/rewards/coupons/${coupon.id}/qr`);
        if (!alive) return;
        setTok(t);
        setError(null);
        await QRCode.toCanvas(canvasRef.current, t.token, { width: 240, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a1838', light: '#ffffff' } });
        timer = setTimeout(load, t.expiresIn + 150);
      } catch (err) { if (alive) setError(err); }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [coupon.id]);

  useEffect(() => {
    if (!tok) return undefined;
    const started = Date.now();
    const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((tok.expiresIn - (Date.now() - started)) / 1000))), 250);
    return () => clearInterval(iv);
  }, [tok]);

  useEffect(() => on('coupon', (d) => { if (d.id === coupon.id && d.status === 'used') onUsed(); }), [on, coupon.id, onUsed]);

  const period = (tok?.period ?? 30000) / 1000;
  return (
    <div className="qr-stage">
      <ErrorNote error={error} />
      <div className="qr-frame" style={{ '--p': left / period }}>
        <svg className="qr-countdown" viewBox="0 0 100 100" aria-hidden="true">
          <rect x="2" y="2" width="96" height="96" rx="14" pathLength="100" className="qr-track" />
          <rect x="2" y="2" width="96" height="96" rx="14" pathLength="100" className="qr-progress" style={{ strokeDashoffset: 100 - (left / period) * 100 }} />
        </svg>
        <canvas ref={canvasRef} role="img" aria-label={`Código QR del cupón ${coupon.benefitLabel}`} />
        <span className="qr-scanline" aria-hidden="true" />
      </div>
      <p className="qr-timer" aria-live="off"><RefreshCw aria-hidden="true" /> Se renueva en <strong className="mono">{left}s</strong></p>
      <div className="coupon-code">
        <span className="muted small">Código de validación</span>
        <strong className="mono">{coupon.code}</strong>
        <CopyText text={coupon.code} label="Copiar código" />
      </div>
      <p className="muted small">Válido hasta el {dateShort(coupon.expiresAt)} en {coupon.place}. Es de un solo uso.</p>
    </div>
  );
}

export default function Hunters() {
  useTitle('Cazadores de Objetos');
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/rewards/me');
  const [showing, setShowing] = useState(null);
  const [busy, setBusy] = useState(null);

  const redeem = async (benefit) => {
    setBusy(benefit.id);
    try {
      const { coupon } = await post('/rewards/coupons', { benefit: benefit.id });
      toast({ title: 'Cupón generado', body: `${benefit.label} · ${coupon.code}`, tone: 'match' });
      reload();
      setShowing(coupon);
    } catch (err) { toast({ title: 'No se pudo generar el cupón', body: err.message, tone: 'error' }); }
    finally { setBusy(null); }
  };

  const onUsed = () => {
    toast({ title: 'Cupón redimido', body: 'El beneficio quedó registrado en tu historial.', tone: 'match' });
    setShowing(null);
    reload();
  };

  if (error) return <div className="shell page"><ErrorNote error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="shell page"><Loading rows={4} /></div>;

  const { points, level, next, levels, benefits, history, deliveries, pointsPerDelivery } = data;
  // avance dentro del tramo actual hacia el siguiente nivel
  const progress = next ? Math.min(1, (points - level.min) / (next.min - level.min)) : 1;

  return (
    <div className="shell page hunters">
      <PageHead eyebrow="HU-18 · HU-19 · HU-20" title={<>Cazadores de <span className="serif">Objetos</span></>}>
        Entrega en la oficina lo que encuentres sin dueño y suma {pointsPerDelivery} puntos cuando el personal confirme la recepción. Con más puntos desbloqueas beneficios en el campus.
      </PageHead>

      <section className={`card hunter-card lvl-${level.id}`} aria-labelledby="h-level">
        <div className="hunter-badge" aria-hidden="true"><Award /></div>
        <div className="hunter-main">
          <span className="muted small">Tu nivel</span>
          <h2 id="h-level">Cazador {level.label}</h2>
          <p className="hunter-points"><strong className="mono">{points}</strong> puntos · {plural(deliveries, 'entrega confirmada', 'entregas confirmadas')}</p>
          <div className="kpi-bar" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="muted small">
            {next ? <>Te faltan <strong>{next.missing}</strong> puntos para ser Cazador {next.label} (unas {Math.ceil(next.missing / pointsPerDelivery)} entregas).</> : 'Alcanzaste el nivel máximo. ¡Gracias por cuidar el campus!'}
          </p>
        </div>
        <Link to="/reportar/encontrado" className="btn btn-primary"><HandHeart aria-hidden="true" /> Reportar un hallazgo</Link>
      </section>

      <section aria-labelledby="h-levels">
        <h2 id="h-levels" className="section-title">Niveles</h2>
        <ol className="level-ladder">
          {levels.map((l) => (
            <li key={l.id} className={`level-step lvl-${l.id} ${l.id === level.id ? 'is-current' : ''} ${points >= l.min ? 'is-reached' : ''}`}>
              <strong>{l.label}</strong>
              <span className="muted small">{l.max == null ? `Más de ${l.min - 1} puntos` : `${l.min} a ${l.max} puntos`}</span>
              <ul>
                {l.benefits.map((b) => <li key={b}>{benefits.find((x) => x.id === b)?.label}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="h-benefits">
        <h2 id="h-benefits" className="section-title">Tus beneficios</h2>
        <ul className="benefit-grid">
          {benefits.map((b) => {
            const I = BENEFIT_ICON[b.id] ?? Ticket;
            return (
              <li key={b.id} className={`card card-pad benefit ${b.unlocked ? '' : 'is-locked'}`}>
                <span className="benefit-ico" aria-hidden="true">{b.unlocked ? <I /> : <Lock />}</span>
                <strong>{b.label}</strong>
                <p className="muted small">{b.detail}</p>
                <p className="small">{b.place}</p>
                <div className="benefit-foot">
                  {!b.unlocked ? (
                    <span className="badge">Nivel {b.levelLabel}</span>
                  ) : b.activeCoupon ? (
                    <button className="btn btn-sm btn-primary" onClick={() => setShowing(b.activeCoupon)}><QrCode aria-hidden="true" /> Mostrar cupón</button>
                  ) : b.availableAt ? (
                    <span className="badge badge-warn">Disponible el {dateShort(b.availableAt)}</span>
                  ) : (
                    <button className="btn btn-sm btn-outline" disabled={busy === b.id} onClick={() => redeem(b)}>
                      {busy === b.id && <span className="spinner" aria-hidden="true" />} Redimir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card card-pad" aria-labelledby="h-history">
        <h2 id="h-history">Historial de transacciones</h2>
        {history.length === 0 ? (
          <EmptyState title="Aún no tienes movimientos" art="card">Cuando la oficina confirme tu primera entrega verás tus puntos aquí.</EmptyState>
        ) : (
          <ul className="tx-list">
            {history.map((t) => (
              <li key={t.id} className={`tx tx-${t.type}`}>
                <span className="tx-ico" aria-hidden="true">{t.type === 'earn' ? <HandHeart /> : t.type === 'coupon_used' ? <CircleCheck /> : <Ticket />}</span>
                <span className="grow">
                  <strong>{TX_LABEL[t.type]}</strong>
                  <span className="muted small">
                    {t.item_id ? <Link to={`/objetos/${t.item_id}`}>{t.note}</Link> : t.note}
                    {t.code && <> · <span className="mono">{t.code}</span></>}
                  </span>
                </span>
                <span className="tx-side">
                  {t.points > 0 && <strong className="tx-points">+{t.points}</strong>}
                  <span className="muted small">{dateTime(t.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="note"><Info aria-hidden="true" /> Los puntos solo se suman cuando el personal de custodia confirma que recibió el objeto, y cada objeto suma una sola vez.</p>

      <Dialog open={!!showing} onClose={() => setShowing(null)} title={showing?.benefitLabel ?? 'Cupón'} size="sm">
        {showing && <CouponQR coupon={showing} onUsed={onUsed} />}
      </Dialog>
    </div>
  );
}
