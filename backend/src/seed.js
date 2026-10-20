import bcrypt from 'bcryptjs';
import { all, one, run, tx } from './db.js';
import { config } from './config.js';
import { COLORS } from './lib/domain.js';
import { record } from './lib/history.js';
import { makeRadicado } from './lib/tokens.js';
import { applyPolicy } from './lib/custody.js';
import { syntheticVector } from './lib/matching/visual.js';
import { runMatching } from './lib/matching/engine.js';
import { checkCustody } from './lib/jobs.js';
import { awardDelivery } from './lib/rewards.js';

export const DEMO_PASSWORD = 'Demo1234*';
const DAY = 86_400_000;
const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();
const hex = (color) => COLORS.find((c) => c.id === color)?.hex ?? '#8a93a3';

export function seed() {
  const prevQuiet = config.quietMail;
  config.quietMail = true;
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const users = {};
  const addUser = (key, email, name, role, alias) => {
    const { lastInsertRowid } = run(
      'INSERT INTO users (email, name, password_hash, role, alias, verified) VALUES (?,?,?,?,?,1)',
      email, name, hash, role, alias
    );
    users[key] = Number(lastInsertRowid);
  };

  tx(() => {
    addUser('admin', 'admin@usbcali.edu.co', 'Oficina de Objetos Perdidos', 'admin', 'Búho Cobalto #01');
    addUser('security', 'seguridad@usbcali.edu.co', 'Equipo de Seguridad', 'security', 'Halcón Marino #07');
    addUser('student', 'estudiante@correo.usbcali.edu.co', 'Estudiante Demo', 'user', 'Colibrí Índigo #42');
    addUser('teacher', 'docente@usbcali.edu.co', 'Docente Demo', 'user', 'Ballena Glaciar #19');
    addUser('finder', 'hallador@correo.usbcali.edu.co', 'Hallador Demo', 'user', 'Nutria Celeste #33');

    // HU-12: políticas de vencimiento
    run("INSERT INTO policies (name, category, days, description) VALUES ('Permanencia general', NULL, 90, 'Plazo institucional por defecto para cualquier objeto.')");
    run("INSERT INTO policies (name, category, days, description) VALUES ('Documentos de identidad', 'documentos', 30, 'Pasado el plazo se remiten a la entidad emisora o a Registro Académico.')");
    run("INSERT INTO policies (name, category, days, description) VALUES ('Termos y recipientes', 'termos', 60, 'Por higiene, los recipientes de alimentos y bebidas tienen un plazo menor.')");
    run("INSERT INTO policies (name, category, days, description) VALUES ('Prendas de vestir', 'prendas', 60, 'Se lavan y pasan a donación o a reciclaje textil.')");

    // HU-14: empresas de reciclaje vinculadas (ficticias para la demostración)
    const company = (name, nit, contact, phone, email, address, materials) => Number(run(
      'INSERT INTO companies (name, nit, contact_name, phone, email, address, materials) VALUES (?,?,?,?,?,?,?)',
      name, nit, contact, phone, email, address, JSON.stringify(materials)
    ).lastInsertRowid);
    var eco = company('EcoCiclo Valle S.A.S.', '900.123.456-7', 'Coordinación de recolección', '602 555 0101', 'recoleccion@ecociclo.example', 'Zona industrial, Cali', ['plastico', 'papel', 'vidrio']);
    company('Pacífico Verde Recicla', '901.987.654-3', 'Línea de aprovechamiento', '602 555 0199', 'contacto@pacificoverde.example', 'Yumbo, Valle', ['plastico', 'metal', 'caucho']);
    company('RAEE Sur Gestión Tecnológica', '900.555.222-1', 'Gestión RAEE', '602 555 0177', 'raee@sur.example', 'Jamundí, Valle', ['electronico', 'metal']);
    company('Textiles Segunda Vida', '901.333.111-9', 'Acopio textil', '602 555 0133', 'acopio@segundavida.example', 'Cali, Valle', ['textil', 'cuero']);

    const items = {};
    const addItem = (key, o) => {
      const { lastInsertRowid } = run(
        `INSERT INTO items (kind, user_id, title, category, color, brand, description, zone, location_detail, event_at,
          custody_mode, status, visual_vec, security_question, security_detail, custody_at, material, recyclable, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        o.kind, users[o.user], o.title, o.category, o.color ?? null, o.brand ?? null, o.description ?? '', o.zone,
        o.detail ?? null, ago(o.days, 2), o.custody ?? null, o.status,
        o.color ? JSON.stringify([syntheticVector(hex(o.color))]) : null,
        o.question ?? null, o.answer ?? null, o.custody === 'office' ? ago(o.days, 1) : null,
        o.material ?? null, o.recyclable ? 1 : 0, ago(o.days, 1.5), ago(o.days, 1)
      );
      const id = Number(lastInsertRowid);
      run('UPDATE items SET radicado = ? WHERE id = ?', makeRadicado(id, new Date(ago(o.days))), id);
      record(id, o.kind === 'lost' ? 'reportado_perdido' : 'reportado_encontrado', users[o.user], { zone: o.zone }, ago(o.days, 1.5));
      if (o.custody === 'office') {
        record(id, 'ingreso_custodia', users.security, { at: ago(o.days, 1) }, ago(o.days, 1));
        applyPolicy(id);
      }
      items[key] = id;
      return id;
    };

    // ── Objetos encontrados ──
    addItem('airpods', { kind: 'found', user: 'security', title: 'Audífonos inalámbricos blancos', category: 'tecnologia', color: 'blanco', brand: 'Apple', description: 'Estuche de carga blanco con audífonos inalámbricos. Estaba en una mesa del segundo piso.', zone: 'biblioteca', detail: 'Segundo piso, mesas grupales', days: 3, custody: 'office', status: 'en_custodia', question: '¿Qué dibujo tiene grabado el estuche?', answer: 'Una luna creciente' });
    addItem('termo', { kind: 'found', user: 'security', title: 'Termo plástico azul', category: 'termos', color: 'azul', description: 'Termo de plástico azul con tapa de rosca y una calcomanía desgastada.', zone: 'cafeteria', days: 121, custody: 'office', status: 'en_custodia', question: '¿Qué calcomanía tiene?', answer: 'Un planeta' });
    addItem('botella', { kind: 'found', user: 'finder', title: 'Botella plástica rosada', category: 'termos', color: 'rosado', description: 'Tomatodo plástico rosado de 1 litro con marcas de horas.', zone: 'coliseo', days: 104, custody: 'office', status: 'en_custodia' });
    addItem('chaqueta', { kind: 'found', user: 'security', title: 'Chaqueta negra impermeable', category: 'prendas', color: 'negro', description: 'Chaqueta negra impermeable talla M con capucha.', zone: 'bloque_b', days: 96, custody: 'office', status: 'en_custodia', question: '¿Qué hay en el bolsillo interno?', answer: 'Un recibo de parqueadero' });
    addItem('calculadora', { kind: 'found', user: 'finder', title: 'Calculadora científica Casio', category: 'utiles', color: 'gris', brand: 'Casio', description: 'Calculadora científica Casio fx-570 con tapa gris. Tiene iniciales en la parte de atrás.', zone: 'bloque_c', detail: 'Salón 304', days: 1, custody: 'holder', status: 'en_espera_entrega', question: '¿Qué iniciales tiene escritas atrás?', answer: 'M.R.' });
    addItem('carnet', { kind: 'found', user: 'security', title: 'Carnet estudiantil', category: 'documentos', color: 'blanco', description: 'Carnet estudiantil de la universidad con cordón azul.', zone: 'porteria', days: 12, custody: 'office', status: 'en_custodia', question: '¿Cuál es tu número de documento (últimos 4 dígitos)?', answer: 'Los del carnet' });
    addItem('sombrilla', { kind: 'found', user: 'security', title: 'Sombrilla azul oscuro', category: 'accesorios', color: 'azul_oscuro', description: 'Sombrilla plegable azul oscuro con mango de madera.', zone: 'bloque_a', days: 80, custody: 'office', status: 'en_custodia' });
    addItem('llaves', { kind: 'found', user: 'finder', title: 'Llavero con tres llaves', category: 'llaves', color: 'plateado', description: 'Tres llaves plateadas con un llavero de delfín azul.', zone: 'plazoleta', days: 5, custody: 'office', status: 'en_custodia', question: '¿Qué figura tiene el llavero?', answer: 'Un delfín' });
    addItem('cuaderno', { kind: 'found', user: 'security', title: 'Cuaderno argollado de cálculo', category: 'utiles', color: 'verde', description: 'Cuaderno argollado verde con apuntes de cálculo integral.', zone: 'laboratorios', days: 142, custody: 'office', status: 'clasificado_reciclaje', material: 'papel', recyclable: true });
    addItem('lonchera', { kind: 'found', user: 'security', title: 'Lonchera plástica verde', category: 'termos', color: 'verde', description: 'Recipiente plástico tipo lonchera con divisiones.', zone: 'cafeteria', days: 150, custody: 'office', status: 'asignado_reciclaje', material: 'plastico', recyclable: true });
    addItem('tomatodo', { kind: 'found', user: 'security', title: 'Tomatodo plástico transparente', category: 'termos', color: 'blanco', description: 'Tomatodo plástico transparente con pitillo.', zone: 'coliseo', days: 175, custody: 'office', status: 'reciclado', material: 'plastico', recyclable: true });
    addItem('celular', { kind: 'found', user: 'finder', title: 'Celular Samsung negro', category: 'tecnologia', color: 'negro', brand: 'Samsung', description: 'Celular Samsung Galaxy negro con forro transparente.', zone: 'cafeteria', days: 41, custody: 'office', status: 'devuelto', question: '¿Qué foto tiene de fondo de pantalla?', answer: 'Un perro beagle' });
    addItem('gafas', { kind: 'found', user: 'security', title: 'Gafas de lectura', category: 'accesorios', color: 'cafe', description: 'Gafas de lectura con marco café en estuche rígido.', zone: 'auditorio', days: 21, custody: 'office', status: 'devuelto', question: '¿De qué color es el estuche?', answer: 'Vinotinto' });
    addItem('portatil', { kind: 'found', user: 'security', title: 'Portátil Lenovo gris', category: 'tecnologia', color: 'gris', brand: 'Lenovo', description: 'Portátil Lenovo ThinkPad gris con calcomanías de programación.', zone: 'laboratorios', days: 63, custody: 'office', status: 'devuelto', question: '¿Qué calcomanías tiene?', answer: 'Python y Linux' });
    addItem('gorra', { kind: 'found', user: 'finder', title: 'Gorra roja deportiva', category: 'prendas', color: 'rojo', description: 'Gorra roja con visera curva.', zone: 'coliseo', days: 31, custody: 'office', status: 'en_custodia' });
    addItem('morral', { kind: 'found', user: 'security', title: 'Morral azul Totto', category: 'accesorios', color: 'azul', brand: 'Totto', description: 'Morral azul con cuaderno y cartuchera adentro, bolsillo lateral roto.', zone: 'bloque_d', days: 2, custody: 'office', status: 'en_custodia', question: '¿Qué hay dentro de la cartuchera?', answer: 'Un USB rojo y lápices' });
    addItem('balon', { kind: 'found', user: 'security', title: 'Balón de fútbol', category: 'deportes', color: 'blanco', description: 'Balón de fútbol número 5 blanco y negro.', zone: 'coliseo', days: 133, custody: 'office', status: 'donado' });
    addItem('cargador', { kind: 'found', user: 'finder', title: 'Cargador USB-C', category: 'tecnologia', color: 'blanco', description: 'Cargador de pared USB-C blanco con cable.', zone: 'biblioteca', days: 0, custody: 'holder', status: 'en_espera_entrega' });
    addItem('bufanda', { kind: 'found', user: 'security', title: 'Bufanda tejida celeste', category: 'prendas', color: 'celeste', description: 'Bufanda tejida a mano de color celeste.', zone: 'auditorio', days: 52, custody: 'office', status: 'en_custodia' });

    // ── Reportes de pérdida ──
    addItem('l_airpods', { kind: 'lost', user: 'student', title: 'AirPods blancos', category: 'tecnologia', color: 'blanco', brand: 'Apple', description: 'Perdí mis audífonos AirPods en la biblioteca. El estuche tiene grabada una luna.', zone: 'biblioteca', days: 3, status: 'activo' });
    addItem('l_calc', { kind: 'lost', user: 'student', title: 'Calculadora Casio fx-570', category: 'utiles', color: 'gris', brand: 'Casio', description: 'Calculadora científica gris, tiene mis iniciales M.R. atrás.', zone: 'bloque_c', days: 1, status: 'activo' });
    addItem('l_morral', { kind: 'lost', user: 'teacher', title: 'Morral azul', category: 'accesorios', color: 'azul', brand: 'Totto', description: 'Morral azul marca Totto con una cartuchera adentro.', zone: 'bloque_d', days: 2, status: 'activo' });
    addItem('l_cel', { kind: 'lost', user: 'student', title: 'Celular Samsung', category: 'tecnologia', color: 'negro', brand: 'Samsung', description: 'Celular negro con forro transparente.', zone: 'cafeteria', days: 42, status: 'recuperado' });
    addItem('l_llaves', { kind: 'lost', user: 'teacher', title: 'Llaves de la casa', category: 'llaves', color: 'plateado', description: 'Llavero con un delfín azul y tres llaves.', zone: 'plazoleta', days: 6, status: 'activo' });

    // ── Historias completas: devoluciones, reclamos y reciclaje ──
    const claim = (itemKey, who, answer, status, days, lostKey = null) => Number(run(
      'INSERT INTO claims (item_id, claimant_id, lost_id, answer, status, decided_by, decided_at, chat_expires, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      items[itemKey], users[who], lostKey ? items[lostKey] : null, answer, status,
      status === 'pending' ? null : users.admin, status === 'pending' ? null : ago(days, -2),
      status === 'approved' ? new Date(Date.now() + 6 * DAY).toISOString() : null, ago(days)
    ).lastInsertRowid);

    const returned = (itemKey, who, answer, days, hoursToReturn, lostKey = null) => {
      const c = claim(itemKey, who, answer, 'delivered', days, lostKey);
      record(items[itemKey], 'reclamo_recibido', users[who], { claimId: c }, ago(days));
      record(items[itemKey], 'reclamo_aprobado', users.admin, { claimId: c }, ago(days, -1));
      record(items[itemKey], 'devuelto', users.admin, { claimId: c, method: 'qr' }, ago(days, -hoursToReturn));
      if (lostKey) record(items[lostKey], 'recuperado', users[who], { foundId: items[itemKey] }, ago(days, -hoursToReturn));
    };
    returned('celular', 'student', 'Un perro beagle', 40, 20, 'l_cel');
    returned('gafas', 'teacher', 'Estuche vinotinto', 20, 6);
    returned('portatil', 'teacher', 'Una de Python y otra de Linux', 61, 30);

    claim('llaves', 'teacher', 'Es un delfín azul de plástico', 'pending', 0.2, 'l_llaves');
    record(items.llaves, 'reclamo_recibido', users.teacher, {}, ago(0.2));

    const morralClaim = claim('morral', 'teacher', 'Un USB rojo, lápices y un borrador', 'approved', 1, 'l_morral');
    run("UPDATE items SET status = 'en_devolucion' WHERE id = ?", items.morral);
    record(items.morral, 'reclamo_recibido', users.teacher, { claimId: morralClaim }, ago(1));
    record(items.morral, 'reclamo_aprobado', users.admin, { claimId: morralClaim }, ago(1, -2));
    run('INSERT INTO messages (claim_id, sender_id, body, created_at) VALUES (?,?,?,?)', morralClaim, users.admin, '¡Hola! Tu morral está en la Oficina de Objetos Perdidos. Puedes pasar de 8:00 a. m. a 5:00 p. m.', ago(1, -3));
    run('INSERT INTO messages (claim_id, sender_id, body, created_at) VALUES (?,?,?,?)', morralClaim, users.teacher, '¡Gracias! Paso mañana a las 10. ¿Llevo el carné?', ago(1, -4));
    run('INSERT INTO messages (claim_id, sender_id, body, created_at) VALUES (?,?,?,?)', morralClaim, users.admin, 'Sí, y muestra el QR de entrega desde la app. 😊', ago(1, -4.2));

    record(items.cuaderno, 'clasificado', users.admin, { material: 'papel', materialLabel: 'Papel y cartón', recyclable: true }, ago(48));
    record(items.lonchera, 'clasificado', users.admin, { material: 'plastico', materialLabel: 'Plástico', recyclable: true }, ago(55));
    run('INSERT INTO assignments (item_id, company_id, assigned_by, assigned_at) VALUES (?,?,?,?)', items.lonchera, eco, users.admin, ago(20));
    record(items.lonchera, 'asignado_reciclaje', users.admin, { companyId: eco, company: 'EcoCiclo Valle S.A.S.' }, ago(20));
    record(items.tomatodo, 'clasificado', users.admin, { material: 'plastico', materialLabel: 'Plástico', recyclable: true }, ago(80));
    run('INSERT INTO assignments (item_id, company_id, assigned_by, assigned_at, disposed_at, disposition, certificate) VALUES (?,?,?,?,?,?,?)', items.tomatodo, eco, users.admin, ago(70), ago(62), 'reciclado', 'CERT-ECO-2026-118');
    record(items.tomatodo, 'asignado_reciclaje', users.admin, { companyId: eco, company: 'EcoCiclo Valle S.A.S.' }, ago(70));
    record(items.tomatodo, 'disposicion_final', users.admin, { outcome: 'reciclado', company: 'EcoCiclo Valle S.A.S.', certificate: 'CERT-ECO-2026-118' }, ago(62));
    record(items.balon, 'protocolo_iniciado', users.admin, { protocol: 'donacion' }, ago(40));
    record(items.balon, 'disposicion_final', users.admin, { outcome: 'donado', notes: 'Donado a la escuela deportiva del barrio' }, ago(35));

    // HU-18 a HU-20: el hallador es Cazador Intermedio por sus entregas confirmadas en la oficina
    for (const key of ['botella', 'celular', 'gorra', 'llaves']) {
      const it = one('SELECT * FROM items WHERE id = ?', items[key]);
      awardDelivery(it, users.security, it.custody_at);
    }
    const coupon = Number(run(
      "INSERT INTO coupons (user_id, benefit, level, code, status, created_at, expires_at, used_at, used_by) VALUES (?, 'seguro', 'basico', 'CZ-DEMO-SEG1', 'used', ?, ?, ?, ?)",
      users.finder, ago(30), ago(23), ago(29), users.admin
    ).lastInsertRowid);
    run("INSERT INTO reward_transactions (user_id, type, coupon_id, note, created_at) VALUES (?, 'coupon_issued', ?, 'Cupón generado: Seguro estudiantil mejorado', ?)", users.finder, coupon, ago(30));
    run("INSERT INTO reward_transactions (user_id, type, coupon_id, actor_id, note, created_at) VALUES (?, 'coupon_used', ?, ?, 'Cupón redimido: Seguro estudiantil mejorado', ?)", users.finder, coupon, users.admin, ago(29));
  });

  // Coincidencias iniciales y alertas de custodia
  for (const { id } of all("SELECT id FROM items WHERE kind = 'lost' AND status = 'activo'")) runMatching(id);
  checkCustody();
  config.quietMail = prevQuiet;

  console.log(`Datos de demostración listos. Contraseña para todas las cuentas: ${DEMO_PASSWORD}`);
  return users;
}
