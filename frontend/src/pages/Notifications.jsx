import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, Radar, ShieldQuestion, PackageCheck, Building2, Timer, Bell } from 'lucide-react';
import { useApi, useTitle } from '../hooks/index.js';
import { useRealtime } from '../context/AppContext.jsx';
import { post } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { EmptyState, ErrorNote, Loading, PageHead } from '../components/ui.jsx';

const ICONS = { match: Radar, claim: ShieldQuestion, delivered: PackageCheck, custody: Building2, policy: Timer, status: Bell };

export default function Notifications() {
  useTitle('Notificaciones');
  const { data, error, loading, reload, setData } = useApi('/notifications');
  const { setUnread, on } = useRealtime();

  useEffect(() => on('notification', (n) => setData((d) => d && { ...d, notifications: [n, ...d.notifications] })), [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAll = async () => {
    await post('/notifications/read');
    setUnread(0);
    setData((d) => ({ ...d, unread: 0, notifications: d.notifications.map((n) => ({ ...n, read: 1 })) }));
  };
  const markOne = (n) => {
    if (n.read) return;
    post('/notifications/read', { ids: [n.id] }).catch(() => {});
    setUnread((u) => Math.max(0, u - 1));
  };

  const list = data?.notifications ?? [];
  const unread = list.filter((n) => !n.read).length;

  return (
    <div className="shell page narrow">
      <PageHead
        eyebrow="Tiempo real"
        title={<>Tus <span className="serif">avisos</span></>}
        actions={unread > 0 && <button className="btn btn-sm btn-outline" onClick={markAll}><CheckCheck aria-hidden="true" /> Marcar todo como leído</button>}
      >
        Coincidencias, reclamos y cambios de estado. Ajusta los canales (Push / correo) en <Link to="/ajustes">Ajustes</Link>.
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : list.length === 0 ? (
        <EmptyState title="Todo en calma">Cuando el motor encuentre algo o alguien responda, aparecerá aquí al instante.</EmptyState>
      ) : (
        <ul className="notif-list">
          {list.map((n, i) => {
            const I = ICONS[n.type] ?? Bell;
            const body = (
              <>
                <span className={`notif-ico act-${n.type}`} aria-hidden="true"><I /></span>
                <span className="notif-text">
                  <strong>{n.title}</strong>
                  <span className="muted">{n.body}</span>
                </span>
                <time className="muted small" dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
                {!n.read && <span className="sr-only">(sin leer)</span>}
              </>
            );
            return (
              <li key={n.id} className={`notif rise ${n.read ? '' : 'is-unread'}`} style={{ '--d': `${Math.min(i, 8) * 0.04}s` }}>
                {n.link ? <Link to={n.link} onClick={() => markOne(n)} className="notif-link">{body}</Link> : <div className="notif-link">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
