import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Compass, Inbox, Bell, Plus, ScanLine, LayoutDashboard, Settings, LogOut, Moon, Sun,
  SearchX, HandHeart, Keyboard, ChevronDown, MonitorSmartphone, Award,
} from 'lucide-react';
import { useAuth, useRealtime, useToast } from '../context/AppContext.jsx';
import { Dialog, Logo } from './ui.jsx';

/* ── Tema: claro / oscuro / sistema, con revelado circular (View Transitions) ── */
const THEME_KEY = 'lfs.theme';
export function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } }
export function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { t === 'system' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t); } catch { /* */ }
}

function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme);
  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const toggle = (e) => {
    const next = isDark ? 'light' : 'dark';
    const r = e.currentTarget.getBoundingClientRect();
    document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
    document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
    const swap = () => { applyTheme(next); setTheme(next); };
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
    document.documentElement.classList.add('theme-switch');
    document.startViewTransition(swap).finished.finally(() => document.documentElement.classList.remove('theme-switch'));
  };
  return (
    <button className="icon-btn theme-toggle" onClick={toggle} aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title="Cambiar tema">
      {isDark ? <Sun /> : <Moon />}
    </button>
  );
}

/* ── Menú "Reportar" ── */
function ReportMenu({ className = '', dock = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const go = (to) => { setOpen(false); navigate(to); };
  return (
    <div className={`report-menu ${open ? 'is-open' : ''} ${className}`} ref={ref}>
      <button
        className={dock ? 'dock-fab' : 'btn btn-primary btn-sm'}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="report-menu-list"
        onClick={() => setOpen((o) => !o)}
      >
        <Plus aria-hidden="true" className="report-plus" />
        {dock ? <span className="sr-only">Reportar</span> : <>Reportar <ChevronDown aria-hidden="true" className="report-chev" /></>}
      </button>
      <div className="report-pop glass" id="report-menu-list" hidden={!open}>
        <button className="report-opt" onClick={() => go('/reportar/perdido')}>
          <span className="report-ico lost"><SearchX aria-hidden="true" /></span>
          <span><strong>Perdí algo</strong><small>Sube foto y descripción; el motor busca por ti.</small></span>
        </button>
        <button className="report-opt" onClick={() => go('/reportar/encontrado')}>
          <span className="report-ico found"><HandHeart aria-hidden="true" /></span>
          <span><strong>Encontré algo</strong><small>Regístralo y ayuda a que vuelva con su dueño.</small></span>
        </button>
      </div>
    </div>
  );
}

/* ── Atajos de teclado ── */
const SHORTCUTS = [
  [['g', 'i'], 'Ir a Inicio', '/inicio'],
  [['g', 'e'], 'Explorar objetos', '/explorar'],
  [['g', 'r'], 'Mis reclamos', '/reclamos'],
  [['g', 'n'], 'Notificaciones', '/notificaciones'],
  [['g', 'c'], 'Cazadores de Objetos', '/cazadores'],
  [['n', 'p'], 'Reportar pérdida', '/reportar/perdido'],
  [['n', 'e'], 'Reportar hallazgo', '/reportar/encontrado'],
];

function useShortcuts(onHelp) {
  const navigate = useNavigate();
  useEffect(() => {
    let prev = null;
    let timer;
    const onKey = (e) => {
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === '?') { e.preventDefault(); onHelp(); return; }
      if (e.key === '/') {
        const search = document.querySelector('[data-search]');
        if (search) { e.preventDefault(); search.focus(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (prev) {
        const hit = SHORTCUTS.find(([keys]) => keys[0] === prev && keys[1] === k);
        prev = null;
        if (hit) { e.preventDefault(); navigate(hit[2]); }
        return;
      }
      if (k === 'g' || k === 'n') { prev = k; clearTimeout(timer); timer = setTimeout(() => { prev = null; }, 900); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, onHelp]);
}

/* ── Detalles escondidos ── */
function useEasterEggs(toast) {
  // Código Konami → modo abisal (burbujas)
  useEffect(() => {
    const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let i = 0;
    const onKey = (e) => {
      i = e.key === seq[i] || e.key.toLowerCase() === seq[i] ? i + 1 : e.key === seq[0] ? 1 : 0;
      if (i === seq.length) {
        i = 0;
        const on = document.documentElement.classList.toggle('abyss');
        toast({ title: on ? 'Modo abisal activado 🫧' : 'De vuelta a la superficie', body: on ? 'Hasta en el fondo del mar encontramos cosas.' : undefined, tone: 'match' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast]);

  // Si te vas de la pestaña, el título te llama de vuelta
  useEffect(() => {
    let saved = document.title;
    const onVis = () => {
      if (document.hidden) { saved = document.title; document.title = '🔎 ¿Sigues buscando?'; }
      else document.title = saved;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
}

function Bubbles() {
  return (
    <div className="bubbles" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} style={{ '--x': `${(i * 37) % 100}%`, '--s': `${6 + (i * 7) % 18}px`, '--t': `${7 + (i % 5) * 2}s`, '--d': `${(i * 0.9) % 8}s` }} />
      ))}
    </div>
  );
}

/* ── Estructura de la app ── */
export default function Layout() {
  const { user, isStaff, logout } = useAuth();
  const { unread, pulse } = useRealtime();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [wink, setWink] = useState(false);
  const prevPath = useRef(location.pathname);

  useShortcuts(() => setHelp(true));
  useEasterEggs(toast);

  // Gestión de foco al cambiar de ruta: lleva el foco al título principal
  useEffect(() => {
    setUserMenu(false);
    if (prevPath.current === location.pathname) return;
    prevPath.current = location.pathname;
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.querySelector('main h1')?.focus({ preventScroll: true }));
  }, [location.pathname]);

  const onLogo = () => {
    const n = logoClicks + 1;
    setLogoClicks(n);
    if (n === 5) {
      setLogoClicks(0);
      setWink(true);
      setTimeout(() => setWink(false), 1200);
      toast({ title: '😉 Te vimos.', body: 'Ojo de lupa: nada se nos escapa.' });
    }
  };

  const nav = [
    { to: '/inicio', label: 'Inicio', icon: Home },
    { to: '/explorar', label: 'Explorar', icon: Compass },
    { to: '/reclamos', label: 'Reclamos', icon: Inbox },
    ...(!isStaff ? [{ to: '/cazadores', label: 'Cazadores', icon: Award }] : []),
    ...(isStaff ? [{ to: '/admin', label: 'Panel', icon: LayoutDashboard }] : []),
  ];

  return (
    <div className="app">
      <a href="#main" className="skip-link">Saltar al contenido</a>
      <header className="app-header">
        <div className="shell header-inner">
          <Link to="/inicio" className="brand" onClick={onLogo} aria-label="Lost&Found Smart, ir al inicio">
            <Logo wink={wink} />
            <span className="brand-name">Lost<span className="amp">&amp;</span>Found <em className="serif">Smart</em></span>
          </Link>
          <nav className="main-nav" aria-label="Principal">
            <ul>
              {nav.map(({ to, label, icon: I }) => (
                <li key={to}>
                  <NavLink to={to} className="nav-link"><I aria-hidden="true" /><span>{label}</span></NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="header-actions">
            <ReportMenu className="hide-mobile" />
            {(isStaff || user) && (
              <Link to="/escanear" className="icon-btn hide-mobile" aria-label="Escanear QR de entrega o cupón" title="Escanear QR de entrega o cupón">
                <ScanLine />
              </Link>
            )}
            <Link to="/notificaciones" className={`icon-btn bell ${pulse ? 'is-ringing' : ''}`} key={pulse} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}>
              <Bell />
              {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <ThemeToggle />
            <div className="user-menu">
              <button className="avatar" aria-expanded={userMenu} aria-controls="user-pop" onClick={() => setUserMenu((o) => !o)} aria-label={`Menú de ${user?.name}`}>
                <span aria-hidden="true">{user?.name?.[0]}</span>
              </button>
              <div className="user-pop glass" id="user-pop" hidden={!userMenu} onKeyDown={(e) => e.key === 'Escape' && setUserMenu(false)}>
                <div className="user-id">
                  <strong>{user?.name}</strong>
                  <span className="muted">{user?.email}</span>
                  <span className="badge badge-cyan">{user?.alias}</span>
                </div>
                {!isStaff && <Link to="/cazadores" className="menu-item"><Award aria-hidden="true" /> Mis puntos de Cazador</Link>}
                <Link to="/ajustes" className="menu-item"><Settings aria-hidden="true" /> Ajustes y notificaciones</Link>
                <button className="menu-item" onClick={() => { setUserMenu(false); setHelp(true); }}><Keyboard aria-hidden="true" /> Atajos de teclado</button>
                <button className="menu-item" onClick={() => { logout(); navigate('/'); }}><LogOut aria-hidden="true" /> Cerrar sesión</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {!user?.verified && user && (
        <div className="verify-banner" role="status">
          <div className="shell row">
            <MonitorSmartphone aria-hidden="true" />
            <span>Verifica tu correo institucional para poder publicar reportes.</span>
            <Link to={`/verificar?email=${encodeURIComponent(user.email)}`} className="btn btn-sm btn-primary">Verificar ahora</Link>
          </div>
        </div>
      )}

      <main id="main" className="app-main" key={location.pathname}>
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="shell spread">
          <span>Universidad de San Buenaventura Cali · Facultad de Ingeniería · 2026-2</span>
          <button className="linkish" onClick={() => setHelp(true)}>Pulsa <kbd>?</kbd> para ver atajos</button>
        </div>
      </footer>

      {/* Dock inferior para móviles */}
      <nav className="dock glass" aria-label="Navegación rápida">
        <NavLink to="/inicio" className="dock-link"><Home aria-hidden="true" /><span>Inicio</span></NavLink>
        <NavLink to="/explorar" className="dock-link"><Compass aria-hidden="true" /><span>Explorar</span></NavLink>
        <ReportMenu dock className="dock-report" />
        <NavLink to="/reclamos" className="dock-link"><Inbox aria-hidden="true" /><span>Reclamos</span></NavLink>
        {isStaff
          ? <NavLink to="/admin" className="dock-link"><LayoutDashboard aria-hidden="true" /><span>Panel</span></NavLink>
          : <NavLink to="/escanear" className="dock-link"><ScanLine aria-hidden="true" /><span>Escanear</span></NavLink>}
      </nav>

      <Dialog open={help} onClose={() => setHelp(false)} title="Atajos de teclado" size="sm">
        <ul className="shortcut-list">
          <li><span><kbd>?</kbd></span> Mostrar esta ayuda</li>
          <li><span><kbd>/</kbd></span> Buscar en el catálogo</li>
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label}><span><kbd>{keys[0]}</kbd> <kbd>{keys[1]}</kbd></span> {label}</li>
          ))}
        </ul>
        <p className="muted small">Pista: hay un código secreto de videojuego clásico escondido por aquí. ↑↑↓↓…</p>
      </Dialog>
      <Bubbles />
    </div>
  );
}
