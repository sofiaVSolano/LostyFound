import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import {
  Laptop, IdCard, Shirt, Backpack, KeyRound, GlassWater, BookOpen, Dumbbell, Package,
  AlertCircle, Check, Copy, X,
} from 'lucide-react';
import { useCountUp, useReducedMotion } from '../hooks/index.js';

export const CATEGORY_ICON = {
  tecnologia: Laptop, documentos: IdCard, prendas: Shirt, accesorios: Backpack, llaves: KeyRound,
  termos: GlassWater, utiles: BookOpen, deportes: Dumbbell, otros: Package,
};
export const CategoryIcon = ({ id, ...p }) => {
  const I = CATEGORY_ICON[id] ?? Package;
  return <I aria-hidden="true" {...p} />;
};

/* ── Logo: una lupa con un pulso de sonar adentro ── */
export function Logo({ size = 34, wink = false }) {
  return (
    <svg className={`logo-mark${wink ? ' is-wink' : ''}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="lg-lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ee1ff" />
          <stop offset="1" stopColor="#2f5fe0" />
        </linearGradient>
      </defs>
      <circle cx="17" cy="17" r="12.5" fill="none" stroke="url(#lg-lens)" strokeWidth="3.2" />
      <path d="M26.5 26.5 35 35" stroke="url(#lg-lens)" strokeWidth="4.2" strokeLinecap="round" />
      <circle className="logo-ping" cx="17" cy="17" r="4" fill="none" stroke="#5ee1ff" strokeWidth="1.5" />
      <circle className="logo-eye" cx="17" cy="17" r="3.4" fill="url(#lg-lens)" />
    </svg>
  );
}

/* ── Campos de formulario con etiquetas, ayudas y errores enlazados ── */
export function Field({ label, hint, error, optional, children, id: idProp, className = '' }) {
  const auto = useId();
  const id = idProp ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label} {optional && <span className="opt">(opcional)</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children}
      {hint && <span className="field-hint" id={hintId}>{hint}</span>}
      {error && (
        <span className="field-error" id={errId} role="alert">
          <AlertCircle aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input(props, ref) {
  return <input ref={ref} className="input" {...props} />;
});

export function ChipGroup({ legend, options, value, onChange, multiple = false, name, error, icon }) {
  const auto = useId();
  const group = name ?? auto;
  const isOn = (v) => (multiple ? (value ?? []).includes(v) : value === v);
  const toggle = (v) => {
    if (!multiple) return onChange(v);
    const set = new Set(value ?? []);
    set.has(v) ? set.delete(v) : set.add(v);
    onChange([...set]);
  };
  return (
    <fieldset className="field chip-fieldset" aria-invalid={error ? true : undefined}>
      {legend && <legend className="field-label">{legend}</legend>}
      <div className="chips">
        {options.map((o) => (
          <label key={o.id} className="chip">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={group}
              value={o.id}
              checked={isOn(o.id)}
              onChange={() => toggle(o.id)}
            />
            {icon && icon(o)}
            {o.label}
          </label>
        ))}
      </div>
      {error && <span className="field-error" role="alert"><AlertCircle aria-hidden="true" /> {error}</span>}
    </fieldset>
  );
}

/* ── Estado de un objeto ── */
const STATUS_TONE = {
  activo: 'accent', recuperado: 'ok', cerrado: '',
  en_espera_entrega: 'cyan', en_custodia: 'accent', en_devolucion: 'warn', devuelto: 'ok',
  en_disposicion: 'warn', clasificado_reciclaje: 'cyan', asignado_reciclaje: 'cyan', reciclado: 'ok', donado: 'ok',
};
export function StatusBadge({ status, label }) {
  return <span className={`badge badge-dot badge-${STATUS_TONE[status] ?? ''}`}>{label}</span>;
}

/* ── Anillo de porcentaje de coincidencia ── */
export function ScoreRing({ value, size = 76, stroke = 7, label = 'de coincidencia' }) {
  const n = useCountUp(value * 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 0.8 ? 'hi' : value >= 0.7 ? 'mid' : 'lo';
  return (
    <div className={`score-ring score-${tone}`} style={{ width: size, height: size }} role="img" aria-label={`${Math.round(value * 100)} % ${label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="score-track" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="score-fill" strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (c * n) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="score-num" aria-hidden="true" style={{ fontSize: Math.round(size * 0.26) }}>{Math.round(n)}<small>%</small></span>
    </div>
  );
}

/* ── Arte del objeto: foto real o ilustración por categoría ── */
export function ItemArt({ item, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  const photo = item.photos?.[0];
  const tint = item.dominant?.[0] ?? '#3d7bff';
  if (photo && !failed) {
    return (
      <div className={`item-art ${className}`}>
        <img src={photo} alt={`Foto de ${item.title}`} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className={`item-art item-art-illus ${className}`} style={{ '--tint': tint }} role="img" aria-label={`Ilustración: ${item.categoryLabel}`}>
      <span className="item-art-rings" aria-hidden="true" />
      <CategoryIcon id={item.category} strokeWidth={1.4} />
    </div>
  );
}

/* ── Texto copiable (radicados, códigos) ── */
export function CopyText({ text, label = 'Copiar', className = '' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* sin permisos */ }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" className={`copy-text mono ${done ? 'is-done' : ''} ${className}`} onClick={copy} aria-label={`${label}: ${text}`}>
      <span>{text}</span>
      {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className="copy-flag" aria-live="polite">{done ? '¡Copiado!' : ''}</span>
    </button>
  );
}

/* ── Estado vacío con ilustración ── */
export function EmptyState({ title, children, action, art = 'lens' }) {
  return (
    <div className="empty">
      <svg className="empty-art" viewBox="0 0 200 140" aria-hidden="true">
        <ellipse cx="100" cy="122" rx="62" ry="8" className="empty-shadow" />
        {art === 'lens' ? (
          <g className="empty-float">
            <circle cx="90" cy="62" r="34" className="empty-glass" />
            <circle cx="90" cy="62" r="34" className="empty-stroke" />
            <path d="M115 87 142 114" className="empty-stroke thick" />
            <path d="M74 52c4-8 12-12 20-12" className="empty-shine" />
            <circle cx="90" cy="62" r="4" className="empty-dot" />
          </g>
        ) : (
          <g className="empty-float">
            <rect x="58" y="36" width="84" height="64" rx="12" className="empty-glass" />
            <rect x="58" y="36" width="84" height="64" rx="12" className="empty-stroke" />
            <path d="M70 58h44M70 72h60M70 86h30" className="empty-shine" />
            <circle cx="140" cy="38" r="9" className="empty-dot" />
          </g>
        )}
      </svg>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-note" role="alert">
      <AlertCircle aria-hidden="true" />
      <span>{error.message}</span>
      {onRetry && <button className="btn btn-sm btn-ghost" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function Loading({ label = 'Cargando…', rows = 3 }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height: 84, animationDelay: `${i * 0.12}s` }} />)}
    </div>
  );
}

/* ── Diálogo modal accesible (usa <dialog> nativo: foco atrapado y Esc) ── */
export function Dialog({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="dialog-inner">
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X /></button>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/* ── Pestañas con navegación por flechas (patrón WAI-ARIA) ── */
export function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef([]);
  const idx = tabs.findIndex((t) => t.id === value);
  const onKey = (e) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next != null) { e.preventDefault(); onChange(tabs[next].id); refs.current[next]?.focus(); }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === value}
          aria-controls={`panel-${t.id}`}
          tabIndex={t.id === value ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }) {
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="tab-panel">{children}</div>;
}

/* ── Tanque de agua: días en custodia (se llena hasta el máximo) ── */
export function WaterTank({ days, max, state, compact = false }) {
  const level = Math.max(4, Math.min(100, (days / max) * 100));
  const label = state === 'vencido' ? 'Vencido' : state === 'proximo' ? 'Por vencer' : 'En plazo';
  return (
    <div className={`tank tank-${state} ${compact ? 'tank-compact' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(days, max)} aria-valuetext={`${days} de ${max} días en custodia · ${label}`}>
      <div className="tank-water" style={{ height: `${level}%` }} aria-hidden="true">
        <svg className="tank-wave" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M0 6 Q 25 0 50 6 T 100 6 T 150 6 T 200 6 V12 H0Z" /></svg>
      </div>
      {!compact && (
        <span className="tank-label" aria-hidden="true">
          <strong>{days}</strong>
          <small>/ {max} d</small>
        </span>
      )}
    </div>
  );
}

/* ── Confeti azul para celebrar una devolución ── */
export function Confetti({ fire }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!fire || reduced) return undefined;
    const c = ref.current;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#2f5fe0', '#5ee1ff', '#9dbbff', '#ffffff', '#14a0a8', '#173fbd'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.55,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 6,
      r: 4 + Math.random() * 6, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)], shape: Math.random() > 0.5,
    }));
    let raf;
    const start = performance.now();
    const tick = (t) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.shape) ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (t - start < 3200) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, reduced]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

/* ── Sonar: animación mientras el motor busca ── */
export function Sonar({ label = 'Buscando coincidencias…', blips = 5 }) {
  return (
    <div className="sonar" role="status" aria-live="polite">
      <div className="sonar-disc" aria-hidden="true">
        <span className="sonar-sweep" />
        <span className="sonar-ring r1" /><span className="sonar-ring r2" /><span className="sonar-ring r3" />
        {Array.from({ length: blips }).map((_, i) => (
          <span key={i} className="sonar-blip" style={{ '--a': `${(i * 137) % 360}deg`, '--r': `${25 + ((i * 53) % 65)}px`, '--d': `${i * 0.37}s` }} />
        ))}
      </div>
      <p>{label}</p>
    </div>
  );
}

export function PageHead({ eyebrow, title, children, actions }) {
  return (
    <header className="page-head">
      <div className="stack" style={{ '--gap': '10px' }}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 tabIndex={-1} className="page-title">{title}</h1>
        {children && <p className="page-lead">{children}</p>}
      </div>
      {actions && <div className="row page-actions">{actions}</div>}
    </header>
  );
}
