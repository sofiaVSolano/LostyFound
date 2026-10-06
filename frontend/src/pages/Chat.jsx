import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Send, ShieldCheck, MapPin, QrCode, ScanLine, ArrowLeft, Clock, EyeOff } from 'lucide-react';
import { useApi, useTitle } from '../hooks/index.js';
import { useRealtime } from '../context/AppContext.jsx';
import { post } from '../lib/api.js';
import { dateTime, timeOnly, timeAgo } from '../lib/format.js';
import { ErrorNote, ItemArt, Loading } from '../components/ui.jsx';

// Mismos patrones que el servidor, para advertir antes de enviar
const SENSITIVE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((?:\+?\d[\s().-]?){7,}\d)|((^|\s)@[a-z0-9_.]{3,})/i;

export default function Chat() {
  const { id } = useParams();
  const { on } = useRealtime();
  const claim = useApi(`/claims/${id}`);
  const msgs = useApi(`/claims/${id}/messages`);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [sendError, setSendError] = useState(null);
  const listRef = useRef(null);
  const lastTyping = useRef(0);
  const c = claim.data?.claim;
  useTitle(c ? `Chat · ${c.item.title}` : 'Chat anónimo');

  useEffect(() => { if (msgs.data) setMessages(msgs.data.messages); }, [msgs.data]);
  useEffect(() => on('message', (m) => {
    if (m.claimId !== Number(id)) return;
    setTyping(false);
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }), [on, id]);
  useEffect(() => {
    let t;
    const off = on('typing', (d) => {
      if (d.claimId !== Number(id)) return;
      setTyping(true);
      clearTimeout(t);
      t = setTimeout(() => setTyping(false), 3000);
    });
    return () => { off(); clearTimeout(t); };
  }, [on, id]);
  useEffect(() => on('claim', (d) => d.id === Number(id) && claim.reload()), [on, id, claim.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, typing]);

  const sensitive = useMemo(() => SENSITIVE.test(text), [text]);
  const open = msgs.data?.chat.open;

  const send = async (body = text) => {
    if (!body.trim()) return;
    setSendError(null);
    try {
      const { message } = await post(`/claims/${id}/messages`, { body });
      setMessages((list) => (list.some((x) => x.id === message.id) ? list : [...list, message]));
      setText('');
    } catch (err) { setSendError(err.message); }
  };
  const onType = (v) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); post(`/claims/${id}/typing`).catch(() => {}); }
  };

  if (claim.error || msgs.error) return <div className="shell page"><ErrorNote error={claim.error || msgs.error} /><Link to="/reclamos" className="btn btn-outline">Volver a reclamos</Link></div>;
  if (!c || !msgs.data) return <div className="shell page"><Loading rows={4} /></div>;
  const other = c.role === 'claimant' ? c.finderAlias : c.claimantAlias;

  return (
    <div className="shell page chat-page">
      <header className="chat-head card">
        <Link to="/reclamos" className="icon-btn" aria-label="Volver a reclamos"><ArrowLeft /></Link>
        <ItemArt item={c.item} className="chat-art" />
        <div className="grow">
          <h1 tabIndex={-1} className="chat-title">{other}</h1>
          <p className="muted small">{c.item.title} · <span className="mono">{c.item.radicado}</span></p>
        </div>
        {c.role === 'claimant' && c.status === 'approved' && <Link to={`/entrega/${c.id}`} className="btn btn-sm btn-primary"><QrCode aria-hidden="true" /> <span className="hide-mobile">Mi QR</span></Link>}
        {c.role !== 'claimant' && c.status === 'approved' && <Link to="/escanear" className="btn btn-sm btn-primary"><ScanLine aria-hidden="true" /> <span className="hide-mobile">Escanear</span></Link>}
      </header>

      <div className="chat-privacy">
        <ShieldCheck aria-hidden="true" />
        <span>Chat anónimo y temporal. Ocultamos automáticamente teléfonos, correos y usuarios de redes.
          {c.chatExpires && open && <> Se cierra {timeAgo(c.chatExpires)} ({dateTime(c.chatExpires)}).</>}
        </span>
      </div>

      <div className="chat-log" ref={listRef} role="log" aria-live="polite" aria-label={`Conversación con ${other}`}>
        {messages.length === 0 && <p className="chat-empty muted">Rompe el hielo: propón un punto seguro del campus para la entrega. 👋</p>}
        {messages.map((m, i) => {
          const showName = !m.mine && (i === 0 || messages[i - 1].mine !== m.mine);
          return (
            <div key={m.id} className={`bubble ${m.mine ? 'mine' : 'theirs'}`}>
              {showName && <span className="bubble-name">{m.alias}</span>}
              <p>{m.body}</p>
              <span className="bubble-meta">
                {m.redacted && <span className="redacted"><EyeOff aria-hidden="true" /> datos ocultos</span>}
                <time dateTime={m.createdAt}>{timeOnly(m.createdAt)}</time>
              </span>
            </div>
          );
        })}
        {typing && <div className="bubble theirs typing" aria-label={`${other} está escribiendo`}><span /><span /><span /></div>}
      </div>

      {open ? (
        <div className="composer card">
          <div className="safe-points" aria-label="Sugerencias de puntos seguros">
            <MapPin aria-hidden="true" />
            {claim.data.safePoints.map((p) => (
              <button key={p.id} className="chip chip-sm" onClick={() => send(`📍 Propongo encontrarnos en: ${p.label}`)}>{p.label}</button>
            ))}
          </div>
          <form className="composer-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label htmlFor="chat-input" className="sr-only">Escribe un mensaje</label>
            <textarea
              id="chat-input" className="textarea composer-input" rows={1} value={text} maxLength={600}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escribe un mensaje…" aria-describedby={sensitive ? 'sensitive-note' : undefined}
            />
            <button className="btn btn-primary composer-send" aria-label="Enviar mensaje" disabled={!text.trim()}><Send aria-hidden="true" /></button>
          </form>
          {sensitive && <p id="sensitive-note" className="sensitive" role="status"><ShieldCheck aria-hidden="true" /> Parece un dato personal: lo ocultaremos al enviarlo para protegerte.</p>}
          {sendError && <p className="field-error" role="alert">{sendError}</p>}
        </div>
      ) : (
        <p className="chat-closed"><Clock aria-hidden="true" /> {msgs.data.chat.reason}</p>
      )}
    </div>
  );
}
