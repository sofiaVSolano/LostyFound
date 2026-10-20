import { config } from '../config.js';
import { isRewarded } from './rewards.js';
import { statusLabel, zoneLabel, categoryLabel, colorLabel, materialLabel, IN_CUSTODY, suggestMaterial } from './domain.js';

const DAY = 86_400_000;
export const isStaff = (u) => u && (u.role === 'admin' || u.role === 'security');

/** HU-11: tiempo en custodia y semáforo respecto al máximo permitido. */
export function custodyInfo(item, now = Date.now()) {
  if (!item.custody_at) return null;
  const days = Math.floor((now - new Date(item.custody_at)) / DAY);
  const max = config.maxCustodyDays;
  const policyDeadline = item.policy_deadline ? new Date(item.policy_deadline) : null;
  const policyExpired = policyDeadline ? policyDeadline <= now : false;
  const active = IN_CUSTODY.includes(item.status);
  let state = 'ok';
  if (active && (days >= max || policyExpired)) state = 'vencido';
  else if (active && (days >= max - 15 || (policyDeadline && policyDeadline - now <= 7 * DAY))) state = 'proximo';
  return {
    days,
    max,
    remaining: max - days,
    state,
    policyExpired,
    policyDaysLeft: policyDeadline ? Math.ceil((policyDeadline - now) / DAY) : null,
  };
}

export function serializeItem(row, viewer) {
  const owner = viewer && viewer.id === row.user_id;
  const staff = isStaff(viewer);
  const out = {
    id: row.id,
    kind: row.kind,
    radicado: row.radicado,
    title: row.title,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    color: row.color,
    colorLabel: row.color ? colorLabel(row.color) : null,
    brand: row.brand,
    description: row.description,
    zone: row.zone,
    zoneLabel: zoneLabel(row.zone),
    locationDetail: row.location_detail,
    eventAt: row.event_at,
    custodyMode: row.custody_mode,
    status: row.status,
    statusLabel: statusLabel(row.kind, row.status),
    photos: JSON.parse(row.photos || '[]'),
    dominant: row.visual_vec ? (JSON.parse(row.visual_vec)[0]?.dominant ?? []) : [],
    hasSecurityQuestion: !!row.security_question,
    securityQuestion: row.security_question,
    reporterAlias: row.reporter_alias,
    isOwner: !!owner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (owner || staff) out.securityDetail = row.security_detail;
  if (staff || owner) {
    out.custodyAt = row.custody_at;
    out.custody = custodyInfo(row);
  }
  if (staff) {
    out.material = row.material;
    out.materialLabel = row.material ? materialLabel(row.material) : null;
    out.suggestedMaterial = suggestMaterial(`${row.title} ${row.description}`);
    out.recyclable = !!row.recyclable;
    out.policyId = row.policy_id;
    out.policyName = row.policy_name ?? null;
    out.policyDeadline = row.policy_deadline;
  }
  // HU-18: ¿la entrega ya sumó puntos de Cazador?
  if ((staff || owner) && row.kind === 'found') out.rewarded = isRewarded(row.id);
  return out;
}

export const ITEM_SELECT = `
  SELECT i.*, u.alias AS reporter_alias, p.name AS policy_name
  FROM items i JOIN users u ON u.id = i.user_id LEFT JOIN policies p ON p.id = i.policy_id`;

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    alias: u.alias,
    verified: !!u.verified,
    notifyPush: !!u.notify_push,
    notifyEmail: !!u.notify_email,
    createdAt: u.created_at,
  };
}
