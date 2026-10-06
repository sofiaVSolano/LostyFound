// Hub de Server-Sent Events: notificaciones y chat en tiempo real (HU-06, HU-07)
const clients = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => {
    const set = clients.get(userId);
    set?.delete(res);
    if (set && set.size === 0) clients.delete(userId);
  };
}

export function emit(userId, event, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(frame);
}

export const isOnline = (userId) => clients.has(userId);

// Latido para mantener vivas las conexiones detrás de proxies
setInterval(() => {
  for (const set of clients.values()) for (const res of set) res.write(': ping\n\n');
}, 25000).unref();
