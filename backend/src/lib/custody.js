import { one, run } from '../db.js';

/** HU-12: asigna la política de vencimiento de la categoría (o la general) al ingresar a custodia. */
export function applyPolicy(itemId, policyId = null) {
  const item = one('SELECT id, category, custody_at FROM items WHERE id = ?', itemId);
  if (!item?.custody_at) return null;
  const policy = policyId
    ? one('SELECT * FROM policies WHERE id = ?', policyId)
    : one('SELECT * FROM policies WHERE category = ? ORDER BY days LIMIT 1', item.category) ??
      one('SELECT * FROM policies WHERE category IS NULL ORDER BY days DESC LIMIT 1');
  if (!policy) return null;
  const deadline = new Date(new Date(item.custody_at).getTime() + policy.days * 86_400_000).toISOString();
  run('UPDATE items SET policy_id = ?, policy_deadline = ?, policy_alerted = 0 WHERE id = ?', policy.id, deadline, itemId);
  return { policy, deadline };
}
