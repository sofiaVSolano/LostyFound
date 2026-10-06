import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  KeyRound, Headphones, GlassWater, IdCard, Umbrella, Calculator, Shirt, ArrowRight, Camera, Cpu,
  ShieldQuestion, MessagesSquare, QrCode, Link2, Recycle, Sparkles, SearchX, HandHeart, Leaf, Clock3,
} from 'lucide-react';
import { useAuth, useToast } from '../context/AppContext.jsx';
import { useApi, useCountUp, useReducedMotion, useReveal, useTitle } from '../hooks/index.js';
import { Confetti, Logo, ScoreRing } from '../components/ui.jsx';
import { hoursLabel } from '../lib/format.js';

const HIDDEN = [
  { icon: KeyRound, label: 'Llaves', where: 'Plazoleta', x: 62, y: 30 },
  { icon: Headphones, label: 'Audífonos', where: 'Biblioteca', x: 82, y: 22 },
  { icon: GlassWater, label: 'Termo', where: 'Cafetería', x: 71, y: 72 },
  { icon: IdCard, label: 'Carnet', where: 'Portería', x: 92, y: 58 },
  { icon: Umbrella, label: 'Sombrilla', where: 'Bloque A', x: 55, y: 60 },
  { icon: Calculator, label: 'Calculadora', where: 'Bloque C', x: 86, y: 84 },
  { icon: Shirt, label: 'Chaqueta', where: 'Coliseo', x: 40, y: 86 },
];

function LensHero() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const toast = useToast();
  const [found, setFound] = useState(() => new Set());
  const [party, setParty] = useState(0);
  const pos = useRef({ x: 0.72, y: 0.45, tx: 0.72, ty: 0.45, idle: 0, manual: false });

  const check = useCallback((px, py) => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const radius = Math.min(150, width * 0.2);
    HIDDEN.forEach((o, i) => {
      const d = Math.hypot((o.x / 100) * width - px * width, (o.y / 100) * height - py * height);
      if (d < radius * 0.55) {
        setFound((prev) => {
          if (prev.has(i)) return prev;
          const next = new Set(prev).add(i);
          if (next.size === HIDDEN.length) {
            setParty((p) => p + 1);
            toast({ title: '¡Ojo de búho! 🦉', body: 'Encontraste los 7 objetos escondidos. Así de bien busca nuestro motor.', tone: 'match' });
          }
          return next;
        });
      }
    });
  }, [toast]);

  useEffect(() => {
    const el = ref.current;
    let raf;
    let t = 0;
    const loop = () => {
      const p = pos.current;
      p.idle += 1;
      if (!reduced && !p.manual && p.idle > 120) {
        // deambula sola trazando una curva de Lissajous
        t += 0.006;
        p.tx = 0.68 + Math.sin(t * 1.3) * 0.22;
        p.ty = 0.5 + Math.sin(t * 2.1 + 1) * 0.3;
      }
      p.x += (p.tx - p.x) * (reduced ? 1 : 0.12);
      p.y += (p.ty - p.y) * (reduced ? 1 : 0.12);
      el.style.setProperty('--lx', `${p.x * 100}%`);
      el.style.setProperty('--ly', `${p.y * 100}%`);
      if (p.idle % 6 === 0) check(p.x, p.y);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, check]);

  const onMove = (e) => {
    if (e.pointerType === 'touch' && e.type === 'pointermove' && !e.isPrimary) return;
    const r = ref.current.getBoundingClientRect();
    pos.current.tx = (e.clientX - r.left) / r.width;
    pos.current.ty = (e.clientY - r.top) / r.height;
    pos.current.idle = 0;
    pos.current.manual = false;
  };
  const onKey = (e) => {
    const step = e.shiftKey ? 0.08 : 0.03;
    const p = pos.current;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!map[e.key]) return;
    e.preventDefault();
    p.manual = true;
    p.idle = 0;
    p.tx = Math.min(0.98, Math.max(0.02, p.tx + map[e.key][0]));
    p.ty = Math.min(0.98, Math.max(0.02, p.ty + map[e.key][1]));
  };

  return (
    <div
      className="lens-stage"
      ref={ref}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onKeyDown={onKey}
      tabIndex={0}
      role="application"
      aria-roledescription="lupa interactiva"
      aria-label={`Lupa interactiva. Usa las flechas para moverla y descubrir objetos escondidos. Encontrados: ${found.size} de ${HIDDEN.length}.`}
    >
      <svg className="lens-map lens-map-base" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <MapLines />
      </svg>
      <div className="lens-reveal" aria-hidden="true">
        <svg className="lens-map lens-map-lit" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice"><MapLines /></svg>
        {HIDDEN.map((o, i) => {
          const I = o.icon;
          return (
            <span key={o.label} className={`hidden-obj ${found.has(i) ? 'is-found' : ''}`} style={{ left: `${o.x}%`, top: `${o.y}%` }}>
              <I strokeWidth={1.6} />
              <small>{o.label} · {o.where}</small>
            </span>
          );
        })}
      </div>
      <div className="lens-ring" aria-hidden="true"><span className="lens-handle" /><span className="lens-glint" /></div>
      <p className="lens-counter" aria-hidden="true">
        <Sparkles /> {found.size === HIDDEN.length ? '¡Todos encontrados!' : `Mueve la lupa · ${found.size}/${HIDDEN.length} objetos escondidos`}
      </p>
      <Confetti fire={party} />
    </div>
  );
}

function MapLines() {
  return (
    <g fill="none" strokeLinecap="round">
      <path className="ml-path" d="M40 560 C 200 520, 260 420, 380 400 S 520 330, 560 260 S 700 160, 820 140 S 940 90, 980 60" />
      <path className="ml-path" d="M560 40 V 580 M 300 150 C 400 230, 480 250, 560 260 M 780 380 C 680 330, 620 300, 560 260 M 960 300 C 880 330, 830 360, 780 380" />
      {[[300, 150, 140, 90], [300, 330, 140, 90], [560, 80, 200, 80], [760, 200, 140, 100], [760, 400, 140, 100], [920, 140, 120, 110], [560, 500, 200, 80], [900, 520, 160, 90], [130, 430, 150, 140]].map(([x, y, w, h], i) => (
        <rect key={i} className="ml-block" x={x - w / 2} y={y - h / 2} width={w} height={h} rx="14" />
      ))}
      <circle className="ml-block" cx="560" cy="290" r="70" />
      {Array.from({ length: 14 }).map((_, i) => <circle key={i} className="ml-tree" cx={(i * 173) % 980 + 10} cy={(i * 97) % 560 + 20} r={6 + (i % 3) * 3} />)}
    </g>
  );
}

function Stat({ value, label, format = (n) => Math.round(n) }) {
  const n = useCountUp(value ?? 0, 1600);
  return (
    <div className="hero-stat">
      <strong>{value == null ? '—' : format(n)}</strong>
      <span>{label}</span>
    </div>
  );
}

function MatchDemo() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setOn(true), { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const chips = ['Tecnología', 'Color blanco', 'Marca Apple', 'audífonos, estuche', 'Misma zona: Biblioteca'];
  return (
    <div className={`match-demo ${on ? 'is-on' : ''}`} ref={ref}>
      <div className="md-tag md-lost">
        <span className="md-kind"><SearchX aria-hidden="true" /> Perdido</span>
        <strong>AirPods blancos</strong>
        <p>“Los dejé en la biblioteca, el estuche tiene una luna grabada.”</p>
        <span className="mono md-rad">LF-2026-0020-QH</span>
      </div>
      <div className="md-core">
        <div className="md-beam" aria-hidden="true" />
        {on ? <ScoreRing value={0.93} size={132} stroke={10} /> : <div style={{ width: 132, height: 132 }} />}
        <ul className="md-chips" aria-label="Atributos en común detectados">
          {chips.map((c, i) => <li key={c} style={{ '--d': `${0.9 + i * 0.15}s` }}>{c}</li>)}
        </ul>
      </div>
      <div className="md-tag md-found">
        <span className="md-kind"><HandHeart aria-hidden="true" /> Encontrado</span>
        <strong>Audífonos inalámbricos</strong>
        <p>“Estuche blanco en una mesa del segundo piso de la biblioteca.”</p>
        <span className="mono md-rad">LF-2026-0001-7K</span>
      </div>
    </div>
  );
}

const TEAM = [
  ['Johan Camilo Balanta Santacruz', 'Product Owner'],
  ['Delio Fernando Palacios Viafara', 'Scrum Master'],
  ['Kevin Alexis López Camacho', 'Analista Funcional / Diseñador UX'],
  ['Sofia Valencia Solano', 'Analista Funcional / UX Engineer'],
  ['Rol incorporado', 'MLOps / Prompt Engineer'],
];

export default function Landing() {
  useTitle(null);
  useReveal();
  const { user } = useAuth();
  const { data: pulse } = useApi('/pulse');
  const home = user ? '/inicio' : '/registro';

  return (
    <div className="landing">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className="land-top">
        <div className="shell spread">
          <Link to="/" className="brand" aria-label="Lost&Found Smart">
            <Logo />
            <span className="brand-name">Lost<span className="amp">&amp;</span>Found <em className="serif">Smart</em></span>
          </Link>
          <nav className="row" aria-label="Cuenta">
            {user ? (
              <Link to="/inicio" className="btn btn-primary btn-sm">Ir a mi panel <ArrowRight aria-hidden="true" /></Link>
            ) : (
              <>
                <Link to="/ingresar" className="btn btn-ghost btn-sm land-login">Ingresar</Link>
                <Link to="/registro" className="btn btn-primary btn-sm">Crear cuenta</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="contenido">
        <section className="hero" aria-labelledby="hero-title">
          <LensHero />
          <div className="shell hero-copy">
            <span className="eyebrow">Universidad de San Buenaventura Cali</span>
            <h1 id="hero-title">
              Lo que se pierde<br />en el campus, <span className="serif hero-accent">vuelve.</span>
            </h1>
            <p className="hero-lead">
              Lost&amp;Found Smart compara fotos y descripciones con visión por computadora y lenguaje natural
              para reunir cada objeto con su dueño — en horas, no en semanas.
            </p>
            <div className="row hero-ctas">
              <Link to={user ? '/reportar/perdido' : home} className="btn btn-primary btn-lg"><SearchX aria-hidden="true" /> Perdí algo</Link>
              <Link to={user ? '/reportar/encontrado' : home} className="btn btn-outline btn-lg hero-ghost"><HandHeart aria-hidden="true" /> Encontré algo</Link>
            </div>
            <div className="hero-stats" aria-label="El campus en cifras">
              <Stat value={pulse?.returned} label="objetos devueltos" />
              <Stat value={pulse?.active} label="esperando a su dueño" />
              <Stat value={pulse?.avgHours} label="tiempo promedio de devolución" format={(n) => hoursLabel(n)} />
            </div>
          </div>
          <div className="hero-fade" aria-hidden="true" />
        </section>

        <section className="land-section shell" aria-labelledby="how-title">
          <div className="section-head reveal">
            <span className="eyebrow">Cómo funciona</span>
            <h2 id="how-title">Tres pasos. <span className="serif">Cero carpetas.</span></h2>
          </div>
          <ol className="steps">
            {[
              [Camera, 'Reporta en segundos', 'Sube hasta 3 fotos, elige la zona en el mapa del campus y describe los detalles que solo tú conoces.'],
              [Cpu, 'El motor compara', 'Embeddings visuales y de texto calculan un porcentaje de similitud con cada hallazgo. Si supera el 80 %, te avisamos al instante.'],
              [QrCode, 'Verifica y recupera', 'Responde la pregunta de seguridad, coordina por chat anónimo y recibe tu objeto mostrando un QR que cambia cada 30 segundos.'],
            ].map(([I, t, d], i) => (
              <li key={t} className="step reveal" style={{ '--d': `${i * 0.12}s` }}>
                <span className="step-num mono">0{i + 1}</span>
                <span className="step-ico"><I aria-hidden="true" /></span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="land-section shell" aria-labelledby="engine-title">
          <div className="section-head reveal">
            <span className="eyebrow">Motor multimodal</span>
            <h2 id="engine-title">No buscamos palabras. <span className="serif">Buscamos tu objeto.</span></h2>
            <p className="muted">“Audífonos” y “AirPods” son lo mismo para nosotros. También el color de la foto, la zona y la hora.</p>
          </div>
          <MatchDemo />
        </section>

        <section className="land-section shell" aria-labelledby="trust-title">
          <div className="section-head reveal">
            <span className="eyebrow">Confianza por diseño</span>
            <h2 id="trust-title">Seguro para quien pierde. <span className="serif">Y para quien encuentra.</span></h2>
          </div>
          <div className="trust">
            {[
              [ShieldQuestion, 'Pregunta secreta', 'Quien encuentra define un detalle que no aparece en la foto: el fondo de pantalla, lo que hay en el estuche.'],
              [MessagesSquare, 'Chat anónimo', 'Alias como “Colibrí Índigo #42”. Los teléfonos y correos se ocultan automáticamente.'],
              [QrCode, 'QR dinámico', 'El código de entrega rota cada 30 s y está firmado criptográficamente. Nadie puede copiarlo.'],
              [Link2, 'Historial inmutable', 'Cada evento queda sellado con un hash encadenado. Si alguien lo altera, la cadena se rompe.'],
            ].map(([I, t, d], i) => (
              <article key={t} className="trust-card reveal" style={{ '--d': `${i * 0.08}s` }}>
                <I aria-hidden="true" />
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land-section shell eco reveal" aria-labelledby="eco-title">
          <div className="eco-copy">
            <span className="eyebrow">Sprint 2 · Sostenibilidad</span>
            <h2 id="eco-title">Lo que nadie reclama <span className="serif">no se pierde: se transforma.</span></h2>
            <p>
              Tras 90 días en custodia (o cuando vence su política), los objetos se clasifican por material y se asignan a
              empresas de reciclaje vinculadas con la Universidad, con trazabilidad de principio a fin.
            </p>
            <div className="row">
              <span className="badge badge-ok"><Recycle aria-hidden="true" /> {pulse?.recycled ?? '—'} objetos reciclados</span>
              <span className="badge badge-cyan"><Clock3 aria-hidden="true" /> Alertas automáticas de vencimiento</span>
            </div>
          </div>
          <div className="eco-marquee" aria-hidden="true">
            <div className="eco-track">
              {[...Array(2)].flatMap((_, k) => ['Plástico', 'Papel y cartón', 'Textil', 'Metal', 'Electrónico (RAEE)', 'Vidrio', 'Caucho'].map((m) => (
                <span key={m + k}><Leaf /> {m}</span>
              )))}
            </div>
          </div>
        </section>

        <section className="land-section shell" aria-labelledby="team-title">
          <div className="section-head reveal">
            <span className="eyebrow">Equipo</span>
            <h2 id="team-title">Hecho en la Facultad de Ingeniería.</h2>
          </div>
          <ul className="team">
            {TEAM.map(([name, role], i) => (
              <li key={name} className="team-card reveal" style={{ '--d': `${i * 0.07}s` }}>
                <span className="team-avatar" aria-hidden="true">{name === 'Rol incorporado' ? '✦' : name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <div>
                  <strong>{name}</strong>
                  <span className="muted">{role}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="land-cta shell reveal">
          <h2>¿Se te perdió algo hoy? <span className="serif">Empecemos a buscar.</span></h2>
          <Link to={home} className="btn btn-primary btn-lg">{user ? 'Ir a mi panel' : 'Crear cuenta con mi correo institucional'} <ArrowRight aria-hidden="true" /></Link>
        </section>
      </main>
      <footer className="land-foot">
        <div className="shell spread">
          <span>© 2026 Lost&amp;Found Smart · USB Cali</span>
          <span className="muted">Pista: prueba ↑ ↑ ↓ ↓ ← → ← → B A dentro de la app.</span>
        </div>
      </footer>
    </div>
  );
}
