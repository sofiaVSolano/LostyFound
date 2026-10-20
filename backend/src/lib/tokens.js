import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// HU-08: QR dinámico. El token rota cada 30 s y está firmado con HMAC.
const STEP_MS = 30_000;

const sign = (claimId, step) =>
  createHmac('sha256', config.qrSecret).update(`${claimId}.${step}`).digest('hex').slice(0, 20);

export function handoverToken(claimId, now = Date.now()) {
  const step = Math.floor(now / STEP_MS);
  return {
    token: `LFS1.${claimId}.${step}.${sign(claimId, step)}`,
    expiresIn: STEP_MS - (now % STEP_MS),
    period: STEP_MS,
  };
}

/** Devuelve el id del reclamo si el token es válido (paso actual o el anterior). */
export function verifyHandoverToken(token, now = Date.now()) {
  const m = /^LFS1\.(\d+)\.(\d+)\.([a-f0-9]{20})$/.exec(String(token || '').trim());
  if (!m) return null;
  const [, claimId, stepStr, sig] = m;
  const step = Number(stepStr);
  const current = Math.floor(now / STEP_MS);
  if (step !== current && step !== current - 1) return null;
  if (!timingSafeEqual(Buffer.from(sign(claimId, step)), Buffer.from(sig))) return null;
  return Number(claimId);
}

export const verificationCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Radicado único y legible: LF-2026-0042-K7 (año, consecutivo y dos caracteres de control). */
export function makeRadicado(id, date = new Date()) {
  const seq = String(id).padStart(4, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let sum = 0;
  for (const ch of `${date.getFullYear()}${seq}`) sum = (sum * 31 + ch.charCodeAt(0)) % 1021;
  return `LF-${date.getFullYear()}-${seq}-${alphabet[sum % 32]}${alphabet[(sum >> 5) % 32]}`;
}

// HU-20 CA1: QR dinámico de un cupón de Cazador. Mismo esquema que el de entrega, con otro prefijo y firma.
const signReward = (couponId, step) =>
  createHmac('sha256', config.qrSecret).update(`reward.${couponId}.${step}`).digest('hex').slice(0, 20);

export function rewardToken(couponId, now = Date.now()) {
  const step = Math.floor(now / STEP_MS);
  return {
    token: `LFR1.${couponId}.${step}.${signReward(couponId, step)}`,
    expiresIn: STEP_MS - (now % STEP_MS),
    period: STEP_MS,
  };
}

export function verifyRewardToken(token, now = Date.now()) {
  const m = /^LFR1\.(\d+)\.(\d+)\.([a-f0-9]{20})$/.exec(String(token || '').trim());
  if (!m) return null;
  const [, couponId, stepStr, sig] = m;
  const step = Number(stepStr);
  const current = Math.floor(now / STEP_MS);
  if (step !== current && step !== current - 1) return null;
  if (!timingSafeEqual(Buffer.from(signReward(couponId, step)), Buffer.from(sig))) return null;
  return Number(couponId);
}
