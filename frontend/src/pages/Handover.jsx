import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { SunMedium, ShieldCheck, RefreshCw, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRealtime } from '../context/AppContext.jsx';
import { useApi, useTitle, useWakeLock } from '../hooks/index.js';
import { Confetti, ErrorNote, Loading, PageHead } from '../components/ui.jsx';
import { Acta } from '../components/Acta.jsx';

/** HU-08 CA1: QR dinámico en la pantalla del dueño, firmado y renovado cada 30 s. */
export default function Handover() {
  const { id } = useParams();
  const { on } = useRealtime();
  const claim = useApi(`/claims/${id}`);
  const canvasRef = useRef(null);
  const [tok, setTok] = useState(null);
  const [left, setLeft] = useState(30);
  const [error, setError] = useState(null);
  const [acta, setActa] = useState(null);
  useTitle('QR de entrega');
  useWakeLock(!acta);

  useEffect(() => {
    if (acta) return undefined;
    let timer;
    let alive = true;
    const load = async () => {
      try {
        const t = await api(`/claims/${id}/qr`);
        if (!alive) return;
        setTok(t);
        setError(null);
        // siempre oscuro sobre blanco: los lectores QR lo necesitan aunque la app esté en tema oscuro
        await QRCode.toCanvas(canvasRef.current, t.token, { width: 260, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a1838', light: '#ffffff' } });
        timer = setTimeout(load, t.expiresIn + 150);
      } catch (err) { if (alive) setError(err); }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, acta]);

  useEffect(() => {
    if (!tok) return undefined;
    const started = Date.now();
    const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((tok.expiresIn - (Date.now() - started)) / 1000))), 250);
    return () => clearInterval(iv);
  }, [tok]);

  useEffect(() => on('claim', (d) => { if (d.id === Number(id) && d.status === 'delivered' && d.acta) setActa(d.acta); }), [on, id]);

  if (claim.error) return <div className="shell page"><ErrorNote error={claim.error} /></div>;
  if (!claim.data) return <div className="shell page"><Loading /></div>;
  const c = claim.data.claim;
  const period = (tok?.period ?? 30000) / 1000;

  return (
    <div className="shell page handover">
      <Link to={`/objetos/${c.item.id}`} className="linkish back-link"><ArrowLeft aria-hidden="true" /> {c.item.title}</Link>
      {acta ? (
        <>
          <PageHead eyebrow="¡Entrega confirmada!" title={<>Bienvenido de vuelta, <span className="serif">{c.item.title.toLowerCase()}</span>.</>} />
          <Acta acta={acta} />
          <Confetti fire={1} />
        </>
      ) : c.status === 'delivered' ? (
        <PageHead eyebrow="Entrega registrada" title="Este objeto ya fue entregado.">Puedes ver el acta en el historial del objeto.</PageHead>
      ) : (
        <>
          <PageHead eyebrow="Acta digital de entrega" title={<>Muestra este código <span className="serif">al recibir</span></>}>
            Quien custodia tu objeto lo escaneará para liberarlo. El código cambia cada {period} segundos y no sirve si alguien lo fotografía.
          </PageHead>
          <ErrorNote error={error} />
          <div className="qr-stage">
            <div className="qr-frame" style={{ '--p': left / period }}>
              <svg className="qr-countdown" viewBox="0 0 100 100" aria-hidden="true">
                <rect x="2" y="2" width="96" height="96" rx="14" pathLength="100" className="qr-track" />
                <rect x="2" y="2" width="96" height="96" rx="14" pathLength="100" className="qr-progress" style={{ strokeDashoffset: 100 - (left / period) * 100 }} />
              </svg>
              <canvas ref={canvasRef} role="img" aria-label="Código QR de entrega" />
              <span className="qr-scanline" aria-hidden="true" />
            </div>
            <p className="qr-timer" aria-live="off"><RefreshCw aria-hidden="true" /> Se renueva en <strong className="mono">{left}s</strong></p>
            {tok && <p className="sr-only" aria-live="polite">Código actualizado.</p>}
            <details className="qr-manual">
              <summary>¿No funciona la cámara? Código manual</summary>
              <code className="mono">{tok?.token}</code>
            </details>
          </div>
          <ul className="qr-tips">
            <li><SunMedium aria-hidden="true" /> Sube el brillo de la pantalla. Mantendremos la pantalla encendida mientras esté abierto.</li>
            <li><ShieldCheck aria-hidden="true" /> Firmado con HMAC-SHA256: solo es válido para esta entrega y durante 30 segundos.</li>
          </ul>
        </>
      )}
    </div>
  );
}
