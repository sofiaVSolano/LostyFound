// HU-06 CA2: oculta teléfonos, correos y usuarios de redes en el chat
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d[\s().-]?){7,}\d/g;
const HANDLE = /(^|\s)@[a-z0-9_.]{3,}/gi;

export function redact(text) {
  let changed = false;
  const out = String(text)
    .replace(EMAIL, () => { changed = true; return '[correo oculto]'; })
    .replace(PHONE, () => { changed = true; return '[teléfono oculto]'; })
    .replace(HANDLE, (_, pre) => { changed = true; return `${pre}[usuario oculto]`; });
  return { text: out, redacted: changed };
}

// Alias anónimos y memorables para el chat y el catálogo
const ANIMALS = ['Búho', 'Colibrí', 'Delfín', 'Zorro', 'Lince', 'Halcón', 'Nutria', 'Tucán', 'Ballena', 'Garza', 'Puma', 'Manatí', 'Cóndor', 'Pingüino', 'Medusa'];
const TONES = ['Índigo', 'Cobalto', 'Celeste', 'Zafiro', 'Marino', 'Turquesa', 'Glaciar', 'Eléctrico', 'Abisal', 'Cerúleo', 'Añil', 'Aguamarina'];

export function randomAlias() {
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const t = TONES[Math.floor(Math.random() * TONES.length)];
  return `${a} ${t} #${Math.floor(10 + Math.random() * 90)}`;
}
