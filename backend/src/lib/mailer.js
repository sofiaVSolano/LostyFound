import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { run } from '../db.js';

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

/**
 * Envía un correo. Sin SMTP configurado, el mensaje queda en la tabla outbox
 * (visible en el "buzón de desarrollo" del frontend) y se imprime en consola.
 */
export async function sendMail(to, subject, body) {
  const { lastInsertRowid } = run('INSERT INTO outbox (to_email, subject, body) VALUES (?,?,?)', to, subject, body);
  if (!transport) {
    if (!config.quietMail) console.log(`\n✉  [correo simulado] para ${to} · ${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text: body });
    run('UPDATE outbox SET delivered = 1 WHERE id = ?', lastInsertRowid);
  } catch (err) {
    console.error('No se pudo enviar el correo:', err.message);
  }
}
