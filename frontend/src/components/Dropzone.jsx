import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Loader2, ClipboardPaste, ScanEye } from 'lucide-react';
import { analyzeImage } from '../lib/vision.js';

const MAX = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png'];

/**
 * Zona para subir fotos (HU-02 CA2): JPG/PNG < 10 MB, máximo 3.
 * Arrastrar y soltar, seleccionar o pegar con Ctrl+V. Cada foto se analiza en el dispositivo.
 */
export function Dropzone({ photos, onChange, error, required }) {
  const [drag, setDrag] = useState(false);
  const [problems, setProblems] = useState([]);
  const inputRef = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const add = async (fileList) => {
    const files = [...fileList];
    const issues = [];
    const current = photosRef.current;
    const room = MAX - current.length;
    if (files.length > room) issues.push(`Solo puedes subir ${MAX} fotos; ignoramos ${files.length - room}.`);
    const accepted = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      if (!TYPES.includes(f.type)) { issues.push(`“${f.name}” no es JPG ni PNG.`); continue; }
      if (f.size > MAX_BYTES) { issues.push(`“${f.name}” pesa ${(f.size / 1048576).toFixed(1)} MB (máximo 10 MB).`); continue; }
      accepted.push({ id: crypto.randomUUID?.() ?? String(Math.random()), file: f, url: URL.createObjectURL(f), analyzing: true });
    }
    setProblems(issues);
    if (!accepted.length) return;
    let next = [...current, ...accepted];
    onChange(next);
    for (const p of accepted) {
      try {
        const { vector } = await analyzeImage(p.file);
        next = photosRef.current.map((x) => (x.id === p.id ? { ...x, vector, analyzing: false } : x));
      } catch {
        next = photosRef.current.map((x) => (x.id === p.id ? { ...x, analyzing: false } : x));
      }
      onChange(next);
    }
  };

  // Pegar una imagen desde el portapapeles (Ctrl+V) en cualquier parte del formulario
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); add(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = (id) => {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    onChange(photos.filter((x) => x.id !== id));
  };

  return (
    <div className="field">
      <span className="field-label" id="photos-label">Fotos {!required && <span className="opt">(opcional, pero ayudan muchísimo)</span>}</span>
      <div className="photos">
        {photos.map((p, i) => (
          <figure key={p.id} className={`photo ${p.analyzing ? 'is-analyzing' : ''}`}>
            <img src={p.url} alt={`Foto ${i + 1} seleccionada`} />
            {p.analyzing && <span className="photo-scan" aria-hidden="true" />}
            <figcaption>
              {p.analyzing ? <><Loader2 className="spin" aria-hidden="true" /> Analizando…</> : p.vector && (
                <span className="photo-swatches" title="Tonos dominantes detectados">
                  <ScanEye aria-hidden="true" />
                  {p.vector.dominant.map((h) => <i key={h} style={{ background: h }} />)}
                </span>
              )}
            </figcaption>
            <button type="button" className="photo-remove" onClick={() => remove(p.id)} aria-label={`Quitar foto ${i + 1}`}><X /></button>
          </figure>
        ))}
        {photos.length < MAX && (
          <label
            className={`drop ${drag ? 'is-drag' : ''} ${error ? 'is-error' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="sr-only"
              aria-labelledby="photos-label"
              aria-describedby="photos-hint"
              aria-invalid={error ? true : undefined}
              onChange={(e) => { add(e.target.files); e.target.value = ''; }}
            />
            <ImagePlus aria-hidden="true" />
            <strong>{photos.length ? 'Agregar otra' : 'Sube o arrastra fotos'}</strong>
            <small>{MAX - photos.length} {MAX - photos.length === 1 ? 'restante' : 'restantes'}</small>
          </label>
        )}
      </div>
      <span className="field-hint" id="photos-hint">
        JPG o PNG, máximo 10 MB cada una. <span className="hint-paste"><ClipboardPaste aria-hidden="true" /> También puedes pegar con <kbd>Ctrl</kbd>+<kbd>V</kbd>.</span>
      </span>
      {[...problems, ...(error ? [error] : [])].map((p) => <span key={p} className="field-error" role="alert">{p}</span>)}
    </div>
  );
}
