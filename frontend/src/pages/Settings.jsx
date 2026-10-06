import { useState } from 'react';
import { BellRing, Mail, Shuffle, Inbox, Monitor, Sun, Moon } from 'lucide-react';
import { useAuth, useMeta, useToast } from '../context/AppContext.jsx';
import { useApi, useTitle } from '../hooks/index.js';
import { patch, post } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { PageHead } from '../components/ui.jsx';
import { applyTheme, getTheme } from '../components/Layout.jsx';

function Toggle({ checked, onChange, label, description, icon: I }) {
  return (
    <label className="toggle-row">
      <span className="toggle-ico" aria-hidden="true"><I /></span>
      <span className="grow">
        <strong>{label}</strong>
        <span className="muted small">{description}</span>
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Settings() {
  useTitle('Ajustes');
  const { user, setUser } = useAuth();
  const meta = useMeta();
  const toast = useToast();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [theme, setTheme] = useState(getTheme);
  const outbox = useApi(meta?.devMailbox ? '/dev/outbox' : null, [meta?.devMailbox]);

  const save = async (patchBody, msg) => {
    try {
      const { user: u } = await patch('/auth/me', patchBody);
      setUser(u);
      toast({ title: msg });
    } catch (err) { toast({ title: 'No se pudo guardar', body: err.message, tone: 'error' }); }
  };

  // HU-07 CA2: activar o desactivar canales de notificación
  const togglePush = async (on) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') toast({ title: 'Permiso denegado', body: 'Puedes habilitarlo luego desde la configuración del navegador.', tone: 'error' });
    }
    save({ notifyPush: on }, on ? 'Notificaciones Push activadas' : 'Notificaciones Push desactivadas');
  };

  const newAlias = async () => {
    const { user: u } = await post('/auth/me/alias');
    setUser(u);
    toast({ title: `Ahora eres ${u.alias}`, body: 'Tu nuevo alias aparecerá en los próximos chats.' });
  };

  const pickTheme = (t) => { applyTheme(t); setTheme(t); };

  return (
    <div className="shell page narrow">
      <PageHead eyebrow="Tu cuenta" title={<>Ajustes</>} />

      <section className="card card-pad settings-block" aria-labelledby="s-notif">
        <h2 id="s-notif">Canales de notificación</h2>
        <p className="muted">Te avisamos cuando el motor detecta una coincidencia mayor al 80 % o cambia el estado de tu reclamo.</p>
        <Toggle icon={BellRing} label="Push del navegador" description={perm === 'denied' ? 'Bloqueadas por el navegador.' : perm === 'unsupported' ? 'Tu navegador no las soporta.' : 'Aparecen aunque tengas la pestaña en segundo plano.'} checked={user.notifyPush} onChange={togglePush} />
        <Toggle icon={Mail} label="Correo institucional" description={user.email} checked={user.notifyEmail} onChange={(on) => save({ notifyEmail: on }, on ? 'Correos activados' : 'Correos desactivados')} />
      </section>

      <section className="card card-pad settings-block" aria-labelledby="s-privacy">
        <h2 id="s-privacy">Privacidad</h2>
        <div className="spread">
          <div>
            <span className="muted small">Tu alias anónimo en chats y catálogo</span>
            <p className="alias-big">{user.alias}</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={newAlias}><Shuffle aria-hidden="true" /> Generar otro</button>
        </div>
      </section>

      <section className="card card-pad settings-block" aria-labelledby="s-look">
        <h2 id="s-look">Apariencia</h2>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          {[['system', 'Sistema', Monitor], ['light', 'Claro', Sun], ['dark', 'Oscuro', Moon]].map(([id, label, I]) => (
            <button key={id} role="radio" aria-checked={theme === id} aria-pressed={theme === id} onClick={() => pickTheme(id)}><I aria-hidden="true" /> {label}</button>
          ))}
        </div>
      </section>

      {meta?.devMailbox && (
        <section className="card card-pad settings-block" aria-labelledby="s-mail">
          <h2 id="s-mail"><Inbox aria-hidden="true" className="inline-ico" /> Buzón de desarrollo</h2>
          <p className="muted small">Sin servidor SMTP configurado, los correos que enviaría la app se guardan aquí.</p>
          {outbox.data?.emails.length ? (
            <ul className="mailbox">
              {outbox.data.emails.map((m) => (
                <li key={m.id}>
                  <details>
                    <summary><strong>{m.subject}</strong><span className="muted small">{m.to_email} · {dateTime(m.created_at)}</span></summary>
                    <pre>{m.body}</pre>
                  </details>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Sin correos todavía.</p>}
        </section>
      )}
    </div>
  );
}
