import { ShieldCheck } from 'lucide-react';
import { dateTime } from '../lib/format.js';

export const EVENT_LABEL = {
  reportado_perdido: 'Reporte de pérdida publicado',
  reportado_encontrado: 'Objeto encontrado reportado',
  ingreso_custodia: 'Ingresó a la oficina de custodia',
  reclamo_recibido: 'Solicitud de reclamo recibida',
  reclamo_aprobado: 'Verificación de propiedad aprobada',
  reclamo_rechazado: 'Verificación rechazada',
  devuelto: 'Devuelto a su dueño · acta digital',
  recuperado: 'Objeto recuperado',
  reporte_cerrado: 'Reporte cerrado',
  custodia_vencida: 'Superó el tiempo máximo de custodia',
  politica_vencida: 'Se cumplió su política de vencimiento',
  politica_asignada: 'Política de vencimiento asignada',
  politica_retirada: 'Política de vencimiento retirada',
  protocolo_iniciado: 'Protocolo de disposición iniciado',
  clasificado: 'Clasificado por material',
  asignado_reciclaje: 'Asignado a empresa de reciclaje',
  disposicion_final: 'Disposición final registrada',
};

function detail(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'clasificado': return `${d.materialLabel ?? d.material}${d.recyclable ? ' · apto para reciclaje' : ''}`;
    case 'asignado_reciclaje': return d.company;
    case 'disposicion_final': return [d.outcome === 'donado' ? 'Donado' : 'Reciclado', d.company, d.certificate && `Cert. ${d.certificate}`, d.notes].filter(Boolean).join(' · ');
    case 'protocolo_iniciado': return d.protocol === 'donacion' ? 'Protocolo de donación' : 'Protocolo de disposición final';
    case 'politica_asignada': case 'politica_vencida': return d.policy;
    case 'reporte_cerrado': return d.status === 'recuperado' ? 'Lo recuperé por otro medio' : null;
    default: return null;
  }
}

/** Historial inmutable: cada evento muestra su sello (hash encadenado). */
export function Timeline({ events }) {
  if (!events?.length) return <p className="muted">Sin eventos todavía.</p>;
  return (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={e.id} className={`tl-item tl-${e.type}`} style={{ '--d': `${i * 0.06}s` }}>
          <span className="tl-dot" aria-hidden="true" />
          <div className="tl-body">
            <strong>{EVENT_LABEL[e.type] ?? e.type}</strong>
            {detail(e) && <span className="ink-2">{detail(e)}</span>}
            <span className="tl-meta muted">
              <time dateTime={e.created_at}>{dateTime(e.created_at)}</time>
              {e.actor_alias && <> · {e.actor_role === 'user' ? e.actor_alias : 'Personal autorizado'}</>}
            </span>
            {e.hash && (
              <span className="tl-hash mono" title={`Sello SHA-256: ${e.hash}\nAnterior: ${e.prev_hash ?? ''}`}>
                <ShieldCheck aria-hidden="true" /> sello {e.hash.slice(0, 10)}…
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
