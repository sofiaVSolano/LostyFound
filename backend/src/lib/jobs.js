import { all, run } from '../db.js';
import { config } from '../config.js';
import { IN_CUSTODY } from './domain.js';
import { record } from './history.js';
import { notifyAdmins } from './notify.js';

/**
 * Revisión periódica de custodia:
 *  - HU-12 CA3: alerta cuando un objeto alcanza la fecha límite de su política.
 *  - HU-11 CA3: alerta cuando un objeto supera el periodo máximo de permanencia.
 */
export function checkCustody(now = new Date()) {
  const marks = IN_CUSTODY.map(() => '?').join(',');
  const policyDue = all(
    `SELECT i.*, p.name AS policy_name FROM items i JOIN policies p ON p.id = i.policy_id
     WHERE i.status IN (${marks}) AND i.policy_alerted = 0 AND i.policy_deadline <= ?`,
    ...IN_CUSTODY, now.toISOString()
  );
  for (const item of policyDue) {
    run('UPDATE items SET policy_alerted = 1 WHERE id = ?', item.id);
    record(item.id, 'politica_vencida', null, { policy: item.policy_name, deadline: item.policy_deadline });
  }

  const limit = new Date(now.getTime() - config.maxCustodyDays * 86_400_000).toISOString();
  const overdue = all(
    `SELECT * FROM items WHERE status IN (${marks}) AND overdue_alerted = 0 AND custody_at <= ?`,
    ...IN_CUSTODY, limit
  );
  for (const item of overdue) {
    run('UPDATE items SET overdue_alerted = 1 WHERE id = ?', item.id);
    record(item.id, 'custodia_vencida', null, { maxDays: config.maxCustodyDays });
  }

  if (policyDue.length) {
    notifyAdmins({
      type: 'policy',
      title: policyDue.length === 1 ? 'Una política de vencimiento se cumplió' : `${policyDue.length} políticas de vencimiento se cumplieron`,
      body: policyDue.slice(0, 3).map((i) => `${i.title} (${i.radicado}) · ${i.policy_name}`).join('\n'),
      link: '/admin/custodia?estado=policy',
    });
  }
  if (overdue.length) {
    notifyAdmins({
      type: 'custody',
      title: `${overdue.length} objeto(s) superaron ${config.maxCustodyDays} días en custodia`,
      body: 'Puedes iniciar el protocolo de donación, disposición o reciclaje.',
      link: '/admin/custodia?estado=vencido',
    });
  }
  return { policyDue: policyDue.length, overdue: overdue.length };
}

export function startJobs() {
  checkCustody();
  setInterval(() => checkCustody(), 10 * 60 * 1000).unref();
}
