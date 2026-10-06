import { Printer, ShieldCheck } from 'lucide-react';
import { dateTime } from '../lib/format.js';
import { Logo } from './ui.jsx';

/** HU-08: acta digital de entrega (imprimible). */
export function Acta({ acta }) {
  return (
    <article className="acta" aria-labelledby="acta-title">
      <header className="acta-head">
        <Logo size={30} />
        <div>
          <span className="eyebrow">Acta digital de entrega</span>
          <h2 id="acta-title">{acta.title}</h2>
        </div>
      </header>
      <dl className="acta-grid">
        <div><dt>Radicado</dt><dd className="mono">{acta.radicado}</dd></div>
        <div><dt>Fecha y hora</dt><dd>{dateTime(acta.deliveredAt)}</dd></div>
        <div><dt>Recibe</dt><dd>{acta.receiverAlias}</dd></div>
        <div><dt>Entrega</dt><dd>{acta.custodian}</dd></div>
        <div><dt>Lugar</dt><dd>{acta.place}</dd></div>
        <div><dt>Estado</dt><dd>Devuelto</dd></div>
      </dl>
      <p className="acta-seal mono"><ShieldCheck aria-hidden="true" /> Sello SHA-256: {acta.hash}</p>
      <button className="btn btn-outline btn-sm no-print" onClick={() => window.print()}><Printer aria-hidden="true" /> Imprimir o guardar PDF</button>
    </article>
  );
}
