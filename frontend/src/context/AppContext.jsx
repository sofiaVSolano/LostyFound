import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, post, tokenStore, streamUrl } from '../lib/api.js';

/* ───────────────────────── Catálogos (categorías, zonas, colores…) ───────────────────────── */
const MetaCtx = createContext(null);

export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = (attempt = 0) =>
      api('/meta').then((m) => alive && setMeta(m)).catch(() => alive && setTimeout(() => load(attempt + 1), Math.min(8000, 1000 * 2 ** attempt)));
    load();
    return () => { alive = false; };
  }, []);
  const value = useMemo(() => {
    if (!meta) return null;
    const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
    return { ...meta, categoryById: by(meta.categories), zoneById: by(meta.zones), colorById: by(meta.colors), materialById: by(meta.materials) };
  }, [meta]);
  return <MetaCtx.Provider value={value}>{children}</MetaCtx.Provider>;
}
export const useMeta = () => useContext(MetaCtx);

/* ───────────────────────── Sesión ───────────────────────── */
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true));
  }, []);

  const accept = useCallback((data) => {
    if (data.token) tokenStore.set(data.token);
    setUser(data.user);
    return data;
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    isStaff: user?.role === 'admin' || user?.role === 'security',
    isAdmin: user?.role === 'admin',
    login: (email, password) => post('/auth/login', { email, password }).then(accept),
    register: (payload) => post('/auth/register', payload).then(accept),
    verify: (email, code) => post('/auth/verify', { email, code }).then(accept),
    logout: () => { tokenStore.set(null); setUser(null); },
    setUser,
  }), [user, ready, accept]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

/* ───────────────────────── Avisos (toasts) ───────────────────────── */
const ToastCtx = createContext(null);
let toastSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((t) => {
    const id = ++toastSeq;
    const item = typeof t === 'string' ? { title: t } : t;
    setToasts((list) => [...list.slice(-3), { id, tone: 'info', ...item }]);
    setTimeout(() => dismiss(id), item.duration ?? 5200);
    return id;
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <ToastRegion toasts={toasts} dismiss={dismiss} />
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

function ToastRegion({ toasts, dismiss }) {
  return (
    <div className="toasts" role="region" aria-label="Avisos">
      <div aria-live="polite" aria-atomic="false" className="toasts-inner">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-mark" aria-hidden="true" />
            <div className="toast-body">
              <strong>{t.title}</strong>
              {t.body && <p>{t.body}</p>}
              {t.action && (
                <button className="toast-action" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
              )}
            </div>
            <button className="icon-btn toast-close" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Tiempo real (SSE) ───────────────────────── */
const RealtimeCtx = createContext(null);

export function RealtimeProvider({ children, onNavigate }) {
  const { user } = useAuth();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [pulse, setPulse] = useState(0); // incrementa con cada notificación: hace "sonar" la campana
  const listeners = useRef(new Map());
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  const on = useCallback((event, fn) => {
    if (!listeners.current.has(event)) listeners.current.set(event, new Set());
    listeners.current.get(event).add(fn);
    return () => listeners.current.get(event)?.delete(fn);
  }, []);

  const refreshUnread = useCallback(() => {
    api('/notifications').then((d) => setUnread(d.unread)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setUnread(0); return undefined; }
    refreshUnread();
    let es;
    let retry;
    let wait = 1000;
    const connect = () => {
      es = new EventSource(streamUrl());
      es.onopen = () => { wait = 1000; };
      const fire = (name) => (ev) => {
        const data = JSON.parse(ev.data);
        listeners.current.get(name)?.forEach((fn) => fn(data));
      };
      for (const name of ['message', 'claim', 'typing', 'coupon']) es.addEventListener(name, fire(name));
      es.addEventListener('notification', (ev) => {
        const n = JSON.parse(ev.data);
        setUnread((u) => u + 1);
        setPulse((p) => p + 1);
        listeners.current.get('notification')?.forEach((fn) => fn(n));
        toast({
          title: n.title, body: n.body, tone: n.type === 'match' ? 'match' : 'info',
          action: n.link ? { label: 'Ver', onClick: () => navRef.current?.(n.link) } : undefined,
          duration: 8000,
        });
        // HU-07: notificación Push del sistema operativo
        if (n.push && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          const sys = new Notification(n.title, { body: n.body, icon: '/favicon.svg', tag: `lfs-${n.id}` });
          sys.onclick = () => { window.focus(); if (n.link) navRef.current?.(n.link); };
        }
      });
      es.onerror = () => {
        es.close();
        retry = setTimeout(connect, wait);
        wait = Math.min(wait * 2, 30000);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [user?.id, refreshUnread, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ unread, setUnread, pulse, on, refreshUnread }), [unread, pulse, on, refreshUnread]);
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}
export const useRealtime = () => useContext(RealtimeCtx);
