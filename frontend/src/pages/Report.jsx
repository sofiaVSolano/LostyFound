import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles, ShieldQuestion, Hand, Building2, Lightbulb, Send, Radar, Wand2, MapPin, Clock,
} from 'lucide-react';
import { useAuth, useMeta, useToast } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { toLocalInput, plural } from '../lib/format.js';
import { suggestColor } from '../lib/vision.js';
import { useTitle } from '../hooks/index.js';
import { Dropzone } from '../components/Dropzone.jsx';
import { CampusMap } from '../components/CampusMap.jsx';
import { CategoryIcon, ChipGroup, CopyText, Dialog, Field, ItemArt, PageHead, Sonar } from '../components/ui.jsx';

const QUESTION_IDEAS = [
  '¿Qué fondo de pantalla tiene?',
  '¿Qué hay dentro del estuche?',
  '¿Tiene algún sticker, grabado o marca?',
  '¿Qué nombre o iniciales tiene escritas?',
];

function quickTimes() {
  const now = new Date();
  const morning = new Date(now); morning.setHours(9, 0, 0, 0);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(14, 0, 0, 0);
  return [
    ['Hace un rato', new Date(now.getTime() - 45 * 60_000)],
    ...(now.getHours() > 10 ? [['Esta mañana', morning]] : []),
    ['Ayer en la tarde', yesterday],
  ];
}

export default function Report() {
  const { kind: kindParam } = useParams();
  const kind = kindParam === 'encontrado' ? 'found' : kindParam === 'perdido' ? 'lost' : null;
  const meta = useMeta();
  const { user, isStaff } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  useTitle(kind === 'found' ? 'Reportar objeto encontrado' : 'Reportar objeto perdido');

  const [photos, setPhotos] = useState([]);
  const [f, setF] = useState({
    title: '', category: '', color: '', brand: '', description: '', zone: '', locationDetail: '',
    eventAt: toLocalInput(), custodyMode: isStaff ? 'office' : '', securityQuestion: '', securityDetail: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const [preview, setPreview] = useState([]);
  const [colorTouched, setColorTouched] = useState(false);
  const summaryRef = useRef(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  // Sugerencia de color a partir de la primera foto analizada
  const suggestion = useMemo(() => {
    const v = photos.find((p) => p.vector)?.vector;
    return v && meta ? suggestColor(v.dominant, meta.colors) : null;
  }, [photos, meta]);
  useEffect(() => {
    if (suggestion && !colorTouched && !f.color) setF((s) => ({ ...s, color: suggestion.id }));
  }, [suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Radar en vivo: mientras escribes, buscamos coincidencias sin guardar nada
  useEffect(() => {
    if (kind !== 'lost' || !f.category || f.title.length < 3) { setPreview([]); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api('/items/preview', {
        method: 'POST', signal: ctrl.signal,
        body: { ...f, eventAt: new Date(f.eventAt).toISOString(), visual: photos.filter((p) => p.vector).map((p) => p.vector) },
      }).then((d) => setPreview(d.matches)).catch(() => {});
    }, 650);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [kind, f.title, f.category, f.color, f.brand, f.description, f.zone, photos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!kind) return <Navigate to="/inicio" replace />;
  if (!meta) return <div className="shell page"><Sonar label="Preparando el formulario…" /></div>;

  const validate = () => {
    const e = {};
    if (f.title.trim().length < 3) e.title = 'Ponle un nombre corto al objeto (ej. “Audífonos inalámbricos”).';
    if (!f.category) e.category = 'Selecciona una categoría.';
    if (!f.zone) e.zone = 'Indica la zona del campus.';
    if (new Date(f.eventAt) > new Date(Date.now() + 5 * 60_000)) e.eventAt = 'La fecha no puede estar en el futuro.';
    if (kind === 'found' && photos.length === 0) e.photos = 'Adjunta al menos una foto del objeto encontrado.';
    if (kind === 'found' && !f.custodyMode) e.custodyMode = 'Cuéntanos dónde está el objeto ahora.';
    if (kind === 'found' && f.securityQuestion.trim() && f.securityDetail.trim().length < 2) e.securityDetail = 'Escribe la respuesta esperada (solo tú y la oficina la verán).';
    if (photos.some((p) => p.analyzing)) e.photos = 'Espera un segundo, seguimos analizando las fotos.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!user.verified) { navigate(`/verificar?email=${encodeURIComponent(user.email)}`); return; }
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append('kind', kind);
    for (const [k, v] of Object.entries(f)) if (v) form.append(k, k === 'eventAt' ? new Date(v).toISOString() : v);
    photos.forEach((p) => form.append('photos', p.file));
    form.append('visual', JSON.stringify(photos.map((p) => p.vector).filter(Boolean)));
    const started = Date.now();
    try {
      const data = await api('/items', { form, method: 'POST' });
      // dejamos que el sonar dé al menos una vuelta: la espera se siente intencional
      await new Promise((r) => setTimeout(r, Math.max(0, 1700 - (Date.now() - started))));
      if (kind === 'lost') navigate(`/coincidencias/${data.item.id}`, { state: { fresh: true } });
      else setSuccess(data);
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { form: err.message });
      if (err.code === 'UNVERIFIED') toast({ title: 'Verifica tu correo', body: err.message, tone: 'error' });
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const draft = {
    id: 0, radicado: 'LF-2026-····-··', title: f.title || (kind === 'lost' ? '¿Qué perdiste?' : '¿Qué encontraste?'),
    category: f.category || 'otros', categoryLabel: meta.categoryById[f.category]?.label ?? 'Categoría',
    photos: photos[0] ? [photos[0].url] : [], dominant: photos[0]?.vector?.dominant ?? (f.color ? [meta.colorById[f.color]?.hex] : []),
    zoneLabel: meta.zoneById[f.zone]?.label ?? 'Zona del campus',
  };
  const errorList = Object.entries(errors).filter(([k]) => k !== 'form');
  const isFound = kind === 'found';

  return (
    <div className="shell page report">
      <PageHead
        eyebrow={isFound ? 'Nuevo hallazgo' : 'Nueva pérdida'}
        title={isFound ? <>Encontraste algo. <span className="serif">Gracias.</span></> : <>Cuéntanos qué <span className="serif">se perdió.</span></>}
      >
        {isFound
          ? 'Registra el objeto con foto y ubicación. Te daremos un número de radicado y avisaremos a quien lo esté buscando.'
          : 'Entre más detalles, mejor busca el motor. Compara tu foto y descripción con cada objeto encontrado en el campus.'}
      </PageHead>

      <div className="report-layout">
        <form className="report-form" onSubmit={submit} noValidate>
          {(errorList.length > 0 || errors.form) && (
            <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
              <strong>{errors.form ?? `Revisa ${plural(errorList.length, 'campo', 'campos')}:`}</strong>
              {errorList.length > 0 && (
                <ul>{errorList.map(([k, msg]) => <li key={k}><a href={`#f-${k}`}>{msg}</a></li>)}</ul>
              )}
            </div>
          )}

          <fieldset className="form-block" id="f-photos">
            <legend><span className="block-num mono">01</span> Fotos</legend>
            <Dropzone photos={photos} onChange={setPhotos} error={errors.photos} required={isFound} />
          </fieldset>

          <fieldset className="form-block">
            <legend><span className="block-num mono">02</span> ¿Qué es?</legend>
            <Field label="Nombre corto" error={errors.title} id="f-title" hint="Como lo buscarías tú: “Termo azul”, “Carnet”, “AirPods”.">
              {(p) => <input {...p} className="input" value={f.title} onChange={set('title')} maxLength={80} autoComplete="off" required />}
            </Field>
            <div id="f-category">
              <ChipGroup
                legend="Categoría" options={meta.categories} value={f.category} onChange={set('category')} error={errors.category}
                icon={(o) => <CategoryIcon id={o.id} />}
              />
            </div>
            <fieldset className="field">
              <legend className="field-label">Color principal <span className="opt">(opcional)</span></legend>
              {suggestion && (
                <p className="ai-hint" role="status">
                  <Wand2 aria-hidden="true" /> En la foto predominan tonos <strong>{suggestion.label.toLowerCase()}</strong>
                  {f.color !== suggestion.id && <button type="button" className="linkish" onClick={() => setF((s) => ({ ...s, color: suggestion.id }))}>Usar este color</button>}
                </p>
              )}
              <div className="swatches">
                {meta.colors.map((c) => (
                  <label key={c.id} className="swatch" title={c.label}>
                    <input type="radio" name="color" value={c.id} checked={f.color === c.id} onChange={() => { setColorTouched(true); set('color')(c.id); }} />
                    <span className="swatch-dot" style={{ background: c.hex ?? 'conic-gradient(#f44, #fd4, #4d8, #4af, #a5f, #f44)' }} aria-hidden="true" />
                    <span className="sr-only">{c.label}</span>
                  </label>
                ))}
              </div>
              {f.color && <span className="field-hint">Seleccionado: {meta.colorById[f.color]?.label}</span>}
            </fieldset>
            <Field label="Marca" optional>
              {(p) => <input {...p} className="input" value={f.brand} onChange={set('brand')} maxLength={40} placeholder="Apple, Casio, Totto…" autoComplete="off" />}
            </Field>
          </fieldset>

          <fieldset className="form-block">
            <legend><span className="block-num mono">03</span> ¿Dónde y cuándo?</legend>
            <div id="f-zone" className="field">
              <span className="field-label" id="zone-label">Zona del campus</span>
              <CampusMap mode="pick" selected={f.zone} onSelect={set('zone')} label="Elige la zona en el mapa" />
              <select className="select" aria-labelledby="zone-label" value={f.zone} onChange={set('zone')} aria-invalid={errors.zone ? true : undefined}>
                <option value="">O elígela de la lista…</option>
                {meta.zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
              {errors.zone && <span className="field-error" role="alert">{errors.zone}</span>}
            </div>
            <Field label="Detalle del lugar" optional>
              {(p) => <input {...p} className="input" value={f.locationDetail} onChange={set('locationDetail')} maxLength={120} placeholder="Ej. salón 304, segundo piso, mesa junto a la ventana" />}
            </Field>
            <Field label={isFound ? 'Fecha y hora en que lo encontraste' : 'Fecha y hora aproximada de la pérdida'} error={errors.eventAt} id="f-eventAt">
              {(p) => (
                <>
                  <input {...p} type="datetime-local" className="input" value={f.eventAt} max={toLocalInput()} onChange={set('eventAt')} />
                  <div className="chips">
                    {quickTimes().map(([label, d]) => (
                      <button type="button" key={label} className="chip chip-sm" onClick={() => set('eventAt')(toLocalInput(d))}>{label}</button>
                    ))}
                  </div>
                </>
              )}
            </Field>
          </fieldset>

          <fieldset className="form-block">
            <legend><span className="block-num mono">04</span> Detalles</legend>
            <Field label="Descripción" optional hint={<><Lightbulb aria-hidden="true" className="inline-ico" /> Stickers, rayones, grabados, lo que tenía adentro… {isFound ? 'Pero guarda un detalle secreto para la pregunta de seguridad.' : 'Los detalles únicos suben el porcentaje.'}</>}>
              {(p) => (
                <div className="textarea-wrap">
                  <textarea {...p} className="textarea" value={f.description} onChange={set('description')} maxLength={1000} rows={4} />
                  <span className={`counter mono ${f.description.length > 900 ? 'is-near' : ''}`} aria-hidden="true">{f.description.length}/1000</span>
                </div>
              )}
            </Field>
          </fieldset>

          {isFound && (
            <>
              <fieldset className="form-block" id="f-custodyMode">
                <legend><span className="block-num mono">05</span> ¿Dónde está ahora?</legend>
                <div className="choice-cards" role="radiogroup" aria-invalid={errors.custodyMode ? true : undefined}>
                  <label className="choice-card">
                    <input type="radio" name="custody" value="holder" checked={f.custodyMode === 'holder'} onChange={() => set('custodyMode')('holder')} />
                    <Hand aria-hidden="true" />
                    <strong>Lo tengo yo</strong>
                    <small>Quedará “En Espera de Entrega”. Coordinarás la devolución por chat anónimo.</small>
                  </label>
                  <label className="choice-card">
                    <input type="radio" name="custody" value="office" checked={f.custodyMode === 'office'} onChange={() => set('custodyMode')('office')} />
                    <Building2 aria-hidden="true" />
                    <strong>Lo entregué en portería u oficina</strong>
                    <small>Quedará “En Custodia” y la oficina gestionará la devolución.</small>
                  </label>
                </div>
                {errors.custodyMode && <span className="field-error" role="alert">{errors.custodyMode}</span>}
              </fieldset>

              <fieldset className="form-block secret-block">
                <legend><span className="block-num mono">06</span> Pregunta de seguridad</legend>
                <p className="muted"><ShieldQuestion aria-hidden="true" className="inline-ico" /> Pregunta por un detalle que <strong>no se vea en la foto</strong>. Así solo el dueño real puede responder.</p>
                <Field label="Pregunta" optional>
                  {(p) => <input {...p} className="input" value={f.securityQuestion} onChange={set('securityQuestion')} maxLength={160} placeholder="¿Qué fondo de pantalla tiene?" />}
                </Field>
                <div className="chips">
                  {QUESTION_IDEAS.map((q) => <button type="button" key={q} className="chip chip-sm" onClick={() => set('securityQuestion')(q)}>{q}</button>)}
                </div>
                {f.securityQuestion && (
                  <Field label="Respuesta esperada (privada)" error={errors.securityDetail} id="f-securityDetail" hint="Solo tú y el personal de custodia la verán, para comparar con la respuesta de quien reclame.">
                    {(p) => <input {...p} className="input secret-input" value={f.securityDetail} onChange={set('securityDetail')} maxLength={160} autoComplete="off" />}
                  </Field>
                )}
              </fieldset>
            </>
          )}

          <div className="form-submit">
            <button className="btn btn-primary btn-lg" disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {isFound ? 'Registrar hallazgo' : 'Publicar y buscar coincidencias'}
            </button>
            <Link to="/inicio" className="btn btn-ghost">Cancelar</Link>
          </div>
        </form>

        <aside className="report-aside" aria-label="Vista previa">
          <div className="preview-tag">
            <span className="preview-label mono">Vista previa de tu etiqueta</span>
            <div className="tag tag-preview">
              <svg className="tag-string" viewBox="0 0 60 40" aria-hidden="true"><path d="M30 40 C 30 22, 50 18, 58 2" /></svg>
              <span className="tag-hole" aria-hidden="true" />
              <ItemArt item={draft} className="tag-art" />
              <div className="tag-body">
                <span className="tag-radicado mono">{draft.radicado}</span>
                <h3 className="tag-title">{draft.title}</h3>
                <p className="tag-meta"><span><MapPin aria-hidden="true" />{draft.zoneLabel}</span><span><Clock aria-hidden="true" />{f.category ? draft.categoryLabel : '—'}</span></p>
              </div>
            </div>
          </div>
          {kind === 'lost' && (
            <div className="live-radar" aria-live="polite">
              <div className="spread"><strong><Radar aria-hidden="true" className="inline-ico" /> Radar en vivo</strong><span className="badge badge-cyan">{preview.length}</span></div>
              {preview.length === 0 ? (
                <p className="muted small">Escribe el nombre y elige la categoría: te mostraremos aquí si ya hay algo parecido, antes de publicar.</p>
              ) : (
                <ul className="radar-list">
                  {preview.map((m) => (
                    <li key={m.item.id}>
                      <ItemArt item={m.item} className="radar-art" />
                      <span><strong>{m.item.title}</strong><small>{m.item.zoneLabel}</small></span>
                      <span className="radar-score mono">{Math.round(m.score * 100)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {isFound && (
            <div className="aside-note">
              <Sparkles aria-hidden="true" />
              <p>Al registrar, comparamos este objeto con todos los reportes de pérdida activos y avisamos al instante a quien tenga una coincidencia mayor al 80 %.</p>
            </div>
          )}
        </aside>
      </div>

      {busy && (
        <div className="busy-overlay" role="dialog" aria-modal="true" aria-label="Procesando reporte">
          <Sonar label={isFound ? 'Registrando y avisando a quienes lo buscan…' : 'Comparando con cada objeto encontrado del campus…'} />
        </div>
      )}

      <Dialog open={!!success} onClose={() => success && navigate(`/objetos/${success.item.id}`)} title="¡Hallazgo registrado!">
        {success && (
          <div className="stack success-ticket">
            <div className="ticket">
              <span className="ticket-label">Número de radicado</span>
              <CopyText text={success.item.radicado} label="Copiar radicado" className="ticket-number" />
              <span className="badge badge-accent">{success.item.statusLabel}</span>
            </div>
            <p>
              {success.matches.length > 0
                ? <>Ya hay <strong>{plural(success.matches.length, 'persona buscando', 'personas buscando')}</strong> algo parecido. Les estamos avisando.</>
                : 'Aún nadie ha reportado algo parecido. Apenas alguien lo haga, el motor lo conectará contigo.'}
            </p>
            {success.item.custodyMode === 'holder' && <p className="muted small">Cuando lo lleves a la portería, márcalo desde tu inicio con “Ya lo entregué en portería”.</p>}
            <div className="row">
              <Link className="btn btn-primary" to={`/objetos/${success.item.id}`}>Ver el objeto</Link>
              <button className="btn btn-ghost" onClick={() => { setSuccess(null); navigate('/inicio'); }}>Ir al inicio</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
