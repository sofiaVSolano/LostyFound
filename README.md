# Lost&Found Smart

Sistema inteligente de objetos perdidos y encontrados de la **Universidad de San Buenaventura Cali**.
Las personas suben fotos y descripciones, y un motor multimodal (visión por computadora + lenguaje natural)
calcula el porcentaje de similitud entre lo que se perdió y lo que se encontró.

> Facultad de Ingeniería · 2026-2
> Johan Camilo Balanta Santacruz (Product Owner) · Delio Fernando Palacios Viafara (Scrum Master) ·
> Kevin Alexis López Camacho (Analista Funcional / Diseñador UX) · Sofia Valencia Solano (Analista Funcional / UX Engineer) ·
> Rol incorporado: MLOps / Prompt Engineer

---

## Puesta en marcha

Requisitos: **Node.js 22.13 o superior** (usa el SQLite integrado de Node, sin instalar bases de datos).

```bash
npm run setup     # instala backend y frontend
npm run dev       # API en http://localhost:4000 · app en http://localhost:5173
```

La primera vez se crea la base de datos con datos de demostración. Para reiniciarla: `npm run seed`.

| Cuenta | Correo | Rol |
|---|---|---|
| Estudiante | `estudiante@correo.usbcali.edu.co` | comunidad (tiene coincidencias del 93 % y 99 %) |
| Docente | `docente@usbcali.edu.co` | comunidad (tiene un reclamo aprobado con chat y QR) |
| Hallador | `hallador@correo.usbcali.edu.co` | comunidad (reportó objetos encontrados) |
| Seguridad | `seguridad@usbcali.edu.co` | personal de seguridad |
| Administración | `admin@usbcali.edu.co` | administrador del punto de atención |

Contraseña de todas: **`Demo1234*`** (en la pantalla de ingreso hay accesos rápidos).

Otros comandos:

```bash
npm test          # pruebas de integración del backend (todas las HU)
npm start         # compila el frontend y lo sirve desde el backend en :4000
```

### Correo

Sin SMTP configurado, los correos (códigos de verificación y notificaciones) se guardan en un
**buzón de desarrollo** visible en *Ajustes* y el código aparece en la pantalla de verificación.
Para enviar correos reales, copia `backend/.env.example` a `backend/.env` y completa `SMTP_*`.
Con `NODE_ENV=production` los códigos dejan de mostrarse en pantalla.

---

## Estructura

```
backend/                 API REST + SSE (Express, SQLite nativo de Node)
  src/
    app.js, server.js    servidor y arranque
    db.js                esquema (incluye triggers que hacen inmutable el historial)
    seed.js              datos de demostración
    lib/
      matching/          motor multimodal: text.js (NLP), visual.js (embeddings), engine.js
      history.js         historial con cadena de hashes SHA-256
      tokens.js          QR dinámico firmado con HMAC, radicados, códigos
      jobs.js            alertas automáticas de custodia y políticas
      privacy.js         ocultamiento de datos en el chat, alias anónimos
    routes/              auth, items, claims (reclamos, chat, entrega), admin, misc
  test/api.test.js       pruebas de extremo a extremo de la API
frontend/                React + Vite
  src/
    lib/vision.js        extracción de embeddings visuales en el navegador
    components/          etiqueta (TagCard), mapa del campus, línea de tiempo, gráficos…
    pages/               portada, ingreso, inicio, reporte, explorar, detalle, chat, QR…
    pages/admin/         métricas, custodia, reciclaje, empresas, políticas, usuarios
    styles/              sistema visual "Sonar" (tokens, base, componentes, páginas)
```

---

## Trazabilidad de historias de usuario

| HU | Dónde vive | Cómo se cumplen los criterios |
|---|---|---|
| **HU-01** Registro institucional | `routes/auth.js`, `pages/Auth.jsx` | Solo `@correo.usbcali.edu.co` y `@usbcali.edu.co`. Código de 6 dígitos + enlace tokenizado; sin verificar no se puede reportar (`requireVerified`). |
| **HU-02** Reporte de pérdida | `pages/Report.jsx`, `POST /api/items` | Hasta 3 fotos, categoría, fecha/hora y zona. JPG/PNG < 10 MB validado en cliente y servidor (incluye “magic bytes”). |
| **HU-03** Registro de hallazgo | ídem | “Lo tengo yo” → *En Espera de Entrega*; “Lo entregué en portería” → *En Custodia*. Radicado único `LF-AAAA-NNNN-XX`. |
| **HU-04** Motor multimodal | `lib/matching/*`, `pages/Matches.jsx` | Compara vectores visuales y de texto al publicar; muestra solo > 60 %, ordenado, con atributos comunes y desglose “¿Por qué este porcentaje?”. |
| **HU-05** Pregunta de seguridad | `Report.jsx`, `ItemDetail.jsx`, `routes/claims.js` | Quien encuentra define pregunta y respuesta privada; se notifica al hallador/custodio para aprobar o rechazar manualmente. |
| **HU-06** Chat anónimo | `pages/Chat.jsx` | Sala temporal (7 días) solo tras aprobar; alias anónimos; teléfonos, correos y @usuarios se ocultan; sugerencias de puntos seguros. |
| **HU-07** Notificaciones | `lib/notify.js`, `RealtimeProvider`, `pages/Settings.jsx` | Tiempo real por SSE + notificación Push del navegador + correo. Aviso instantáneo con coincidencias > 80 %. Canales activables en Ajustes. |
| **HU-08** Acta digital con QR | `pages/Handover.jsx`, `pages/Scan.jsx` | QR dinámico (rota cada 30 s, HMAC-SHA256) en la pantalla del dueño; el custodio lo escanea; estado *Devuelto*; acta imprimible sellada en el historial inmutable. |
| **HU-09** Mapa y filtros | `pages/Explore.jsx`, `CampusMap.jsx` | Mapa SVG interactivo con marcadores por zona (accesible por teclado) y filtros de fecha, categoría y estado sincronizados con la URL. |
| **HU-10** Panel de administración | `pages/admin/Dashboard.jsx`, `Custody.jsx` | Tasa de éxito, tiempo promedio de reclamación, volumen por categoría, tendencia mensual. Objetos > 90 días → protocolo de donación o disposición. |
| **HU-11** Tiempo de permanencia | `pages/admin/Custody.jsx` | Fecha de ingreso automática; tiempo transcurrido como “tanque de agua”; filtros *Por vencer* / *Vencidos*. |
| **HU-12** Políticas de vencimiento | `pages/admin/Policies.jsx`, `lib/jobs.js` | Política por categoría con fecha límite; alerta automática al cumplirse; vista *Política cumplida*. |
| **HU-13** Clasificación para reciclaje | `pages/admin/Recycling.jsx` | Clasificación por material, listado de reciclables, clasificación conservada en el historial. |
| **HU-14** Empresas vinculadas | `pages/admin/Companies.jsx` | Nombre, NIT, contacto, materiales que recibe; activar/desactivar. |
| **HU-15** Asignación a empresas | Recycling → *Listos para asignar* | Solo se ofrecen empresas compatibles con el material; registra empresa y fecha; estado *Asignado a reciclaje*. Asignación en lote. |
| **HU-16** Objetos plásticos | Recycling → filtro *Solo plásticos* | El material se sugiere automáticamente (termos, botellas…); solo es reciclable si cumple las condiciones (plazo vencido y sin reclamos). |
| **HU-17** Disposición final | Recycling → *Asignados* / *Histórico* | Fecha, certificado y observaciones; estado *Reciclado*; trazabilidad completa en el historial del objeto. |

---

## El motor de coincidencias (rol MLOps / Prompt Engineer)

```
puntaje = 0.40 · visual + 0.30 · texto + 0.30 · atributos      (sin fotos: 0.45 · texto + 0.55 · atributos)
```

- **Visual** — el navegador convierte cada foto en un embedding ligero: histograma de color RGB de 64
  dimensiones (ponderado hacia el centro, donde suele estar el objeto), un *dHash* perceptual de 64 bits
  y los colores dominantes. Se comparan con Bhattacharyya + intersección de histogramas y distancia de Hamming.
  Procesarlo en el dispositivo hace que la sugerencia de color sea instantánea.
- **Texto** — normalización, *stopwords* en español, *stemming* ligero y un diccionario de sinónimos del campus
  (“AirPods” = “audífonos”, “tomatodo” = “termo”, “carné” = “documento”…), luego similitud coseno TF-IDF.
- **Atributos** — categoría, cercanía de color, marca, distancia entre zonas del mapa y plausibilidad temporal.

`backend/src/lib/matching/visual.js` expone una interfaz pequeña (`visualSimilarity`) pensada para que el rol
MLOps la reemplace por embeddings CLIP u otro modelo sin tocar el resto del sistema.

---

## Experiencia de usuario y accesibilidad

**Detalles pensados (algunos escondidos):**
- La portada tiene una **lupa** que sigue el cursor (o se mueve sola, o con las flechas del teclado) y revela 7 objetos escondidos en el plano del campus. Encuéntralos todos.
- Las tarjetas son **etiquetas de equipaje** con ojal y borde perforado; se balancean al pasar el cursor.
- El tiempo en custodia se ve como un **tanque de agua** que se llena hasta el límite.
- Al subir una foto, la app **detecta el color** y lo propone. También puedes **pegar imágenes con Ctrl+V**.
- **Radar en vivo**: mientras escribes un reporte de pérdida ya ves si hay algo parecido.
- Autocompletado del dominio institucional, aviso de **Bloq Mayús**, medidor de contraseña y código de 6 casillas que acepta pegar.
- El QR muestra un contorno que se vacía hasta la próxima rotación y **mantiene la pantalla encendida**.
- El chat avisa *antes* de enviar si detecta un teléfono o correo.
- Confeti azul al devolver un objeto. El tema claro/oscuro cambia con un **revelado circular**.
- Saludo según la hora, alias como “Colibrí Índigo #42”, el título de la pestaña te llama si te vas.
- Atajos: <kbd>?</kbd> ayuda, <kbd>/</kbd> buscar, <kbd>g</kbd> <kbd>i</kbd> inicio, <kbd>n</kbd> <kbd>p</kbd> reportar pérdida…
- Huevos de pascua: el **código Konami** activa el *modo abisal*; cinco clics en el logo hacen guiñar la lupa; un mensaje en la consola.

**Accesibilidad:** enlace “Saltar al contenido”, foco visible de doble anillo, el foco va al título en cada cambio
de página y se anuncia a lectores de pantalla, formularios con etiquetas, ayudas y errores enlazados
(`aria-describedby`, `aria-invalid`, resumen de errores con enlaces), diálogos nativos con foco atrapado,
pestañas con navegación por flechas, mapa operable con teclado más lista alternativa, gráficos con leyenda,
etiquetas directas y vista de tabla (paleta validada para daltonismo), `prefers-reduced-motion`, modo de alto
contraste (`forced-colors`), estilos de impresión para el acta y diseño responsive con dock inferior en móvil.

---

## API (resumen)

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/auth/register` · `/verify` · `/resend` · `/login` | Cuenta institucional |
| GET/PATCH | `/api/auth/me` | Perfil y canales de notificación |
| POST | `/api/items` | Reportar pérdida o hallazgo (multipart) |
| GET | `/api/items` · `/items/mine` · `/items/:id` · `/items/:id/matches` | Catálogo, mis reportes, detalle, coincidencias |
| POST | `/api/items/preview` · `/:id/check-in` · `/:id/close` | Radar en vivo, ingreso a custodia, cerrar reporte |
| POST/GET | `/api/claims` · `/claims/:id/decide` · `/claims/:id/messages` · `/claims/:id/qr` | Reclamos, chat, QR |
| POST | `/api/handover/redeem` | Validar QR y generar acta |
| GET | `/api/stream` | Eventos en tiempo real (SSE) |
| GET/POST | `/api/admin/…` | Métricas, custodia, políticas, clasificación, empresas, asignaciones, disposición |
