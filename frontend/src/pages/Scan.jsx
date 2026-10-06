import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine } from 'lucide-react';
import { post } from '../lib/api.js';
import { useTitle } from '../hooks/index.js';
import { Confetti, Field, PageHead } from '../components/ui.jsx';
import { Acta } from '../components/Acta.jsx';

/** HU-08: el custodio o hallador escanea el QR del dueño para liberar el objeto. */
export default function Scan() {
  useTitle('Escanear entrega');
  const videoRef = useRef(null);
  const [camera, setCamera] = useState('idle'); // idle | on | unsupported | denied
  const [manual, setManual] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acta, setActa] = useState(null);
  const streamRef = useRef(null);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamera('idle'); };
  useEffect(() => stop, []);

  const redeem = async (token) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
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
          const hit = codes.find((c) => c.rawValue.startsWith('LFS1.'));
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
      </PageHead>

      {acta ? (
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
            <p className="muted small">El dueño puede abrir “Código manual” debajo de su QR.</p>
            <Field label="Código de entrega" error={error}>
              {(p) => <input {...p} className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="LFS1.…" autoComplete="off" spellCheck={false} />}
            </Field>
            <button className="btn btn-primary" disabled={!manual.trim() || busy}>{busy && <span className="spinner" aria-hidden="true" />} Validar y entregar</button>
          </form>
        </div>
      )}
      {error && camera === 'on' && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
