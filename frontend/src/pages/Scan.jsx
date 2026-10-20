import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine, Ticket } from 'lucide-react';
import { post } from '../lib/api.js';
import { useTitle } from '../hooks/index.js';
import { useAuth } from '../context/AppContext.jsx';
import { dateTime } from '../lib/format.js';
import { Confetti, Field, PageHead } from '../components/ui.jsx';
import { Acta } from '../components/Acta.jsx';

/** HU-20 CA1: cupones de Cazador (QR dinámico LFR1 o código CZ-XXXX-XXXX). */
const isCoupon = (t) => /^LFR1\./.test(t) || /^CZ-/i.test(t);

/**
 * HU-08: el custodio o hallador escanea el QR del dueño para liberar el objeto.
 * HU-20: el personal también valida aquí los cupones de beneficios de los Cazadores.
 */
export default function Scan() {
  useTitle('Escanear entrega');
  const { isStaff } = useAuth();
  const videoRef = useRef(null);
  const [camera, setCamera] = useState('idle'); // idle | on | unsupported | denied
  const [manual, setManual] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acta, setActa] = useState(null);
  const [coupon, setCoupon] = useState(null);
  const streamRef = useRef(null);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamera('idle'); };
  useEffect(() => stop, []);

  const redeem = async (token) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      token = token.trim();
      if (isStaff && isCoupon(token)) {
        const { coupon: c } = await post('/rewards/validate', { token });
        navigator.vibrate?.([60, 40, 120]);
        stop();
        setCoupon(c);
        return;
      }
      const { acta: a } = await post('/handover/redeem', { token });
      navigator.vibrate?.([60, 40, 120]);
      stop();
      setActa(a);
    } catch (err) {
      setError(err.message);
      navigator.vibrate?.(200);
    } finally { setBusy(false); }
  };

  const start = async () => {
    if (!supported) { setCamera('unsupported'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamera('on');
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const hit = codes.find((c) => c.rawValue.startsWith('LFS1.') || (isStaff && c.rawValue.startsWith('LFR1.')));
          if (hit) { await redeem(hit.rawValue); if (!streamRef.current) return; }
        } catch { /* cuadro sin código */ }
        setTimeout(loop, 280);
      };
      loop();
    } catch {
      setCamera('denied');
    }
  };

  return (
    <div className="shell page scan">
      <PageHead eyebrow="Entrega de objeto" title={<>Escanea el <span className="serif">QR del dueño</span></>}>
        Al validar el código, el objeto pasa a “Devuelto” y se genera el acta digital en el historial inmutable.
        {isStaff && ' También puedes validar aquí los cupones de beneficios de los Cazadores de Objetos.'}
      </PageHead>

      {coupon ? (
        <>
          <section className="card card-pad stack coupon-ok" role="status">
            <h2><Ticket aria-hidden="true" className="inline-ico" /> Cupón válido y redimido</h2>
            <p><strong>{coupon.benefitLabel}</strong> para {coupon.ownerAlias} (nivel {coupon.level}).</p>
            <p className="muted small"><span className="mono">{coupon.code}</span> · registrado el {dateTime(coupon.usedAt)}. Ya no puede volver a usarse.</p>
          </section>
          <button className="btn btn-outline" onClick={() => { setCoupon(null); setManual(''); }}><ScanLine aria-hidden="true" /> Escanear otro</button>
        </>
      ) : acta ? (
        <>
          <Acta acta={acta} />
          <button className="btn btn-outline" onClick={() => setActa(null)}><ScanLine aria-hidden="true" /> Escanear otro</button>
          <Confetti fire={acta.hash} />
        </>
      ) : (
        <div className="scan-layout">
          <div className={`scanner ${camera === 'on' ? 'is-on' : ''}`}>
            <video ref={videoRef} playsInline muted aria-label="Vista de la cámara" />
            {camera !== 'on' && (
              <div className="scanner-idle">
                <ScanLine aria-hidden="true" />
                {camera === 'unsupported' && <p>Tu navegador no permite leer QR con la cámara. Usa el código manual.</p>}
                {camera === 'denied' && <p>No pudimos acceder a la cámara. Revisa los permisos o usa el código manual.</p>}
                <button className="btn btn-primary" onClick={start}><Camera aria-hidden="true" /> Activar cámara</button>
              </div>
            )}
            {camera === 'on' && (
              <>
                <span className="scanner-frame" aria-hidden="true" />
                <button className="btn btn-sm btn-ghost scanner-stop" onClick={stop}><CameraOff aria-hidden="true" /> Detener</button>
              </>
            )}
          </div>
          <form className="card card-pad stack" onSubmit={(e) => { e.preventDefault(); redeem(manual); }}>
            <h2><Keyboard aria-hidden="true" className="inline-ico" /> Código manual</h2>
            <p className="muted small">El dueño puede abrir “Código manual” debajo de su QR.{isStaff && ' Para un cupón, escribe el código CZ-XXXX-XXXX.'}</p>
            <Field label={isStaff ? 'Código de entrega o de cupón' : 'Código de entrega'} error={error}>
              {(p) => <input {...p} className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={isStaff ? 'LFS1.… o CZ-…' : 'LFS1.…'} autoComplete="off" spellCheck={false} />}
            </Field>
            <button className="btn btn-primary" disabled={!manual.trim() || busy}>{busy && <span className="spinner" aria-hidden="true" />} {isStaff && isCoupon(manual.trim()) ? 'Validar cupón' : 'Validar y entregar'}</button>
          </form>
        </div>
      )}
      {error && camera === 'on' && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
