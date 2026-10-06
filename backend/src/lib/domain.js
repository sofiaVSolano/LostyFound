// Catálogos de dominio compartidos con el frontend vía GET /api/meta

export const CATEGORIES = [
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'prendas', label: 'Prendas' },
  { id: 'accesorios', label: 'Accesorios' },
  { id: 'llaves', label: 'Llaves' },
  { id: 'termos', label: 'Termos y botellas' },
  { id: 'utiles', label: 'Útiles y libros' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'otros', label: 'Otros' },
];

// Zonas del campus para el mapa interactivo (HU-09). x/y = centro en un lienzo de 1000x640.
export const ZONES = [
  { id: 'porteria', label: 'Portería principal', short: 'Portería', x: 110, y: 585, w: 140, h: 50, safe: true },
  { id: 'parqueadero', label: 'Parqueadero', x: 110, y: 430, w: 150, h: 160 },
  { id: 'oficina', label: 'Oficina de Objetos Perdidos', short: 'Oficina O.P.', x: 285, y: 560, w: 130, h: 70, safe: true },
  { id: 'bloque_a', label: 'Bloque A', x: 300, y: 200, w: 120, h: 100 },
  { id: 'bloque_b', label: 'Bloque B', x: 300, y: 370, w: 120, h: 100 },
  { id: 'biblioteca', label: 'Biblioteca', x: 500, y: 110, w: 200, h: 100, safe: true },
  { id: 'plazoleta', label: 'Plazoleta central', short: 'Plazoleta', x: 500, y: 320, w: 150, h: 150, safe: true, round: true },
  { id: 'cafeteria', label: 'Cafetería', x: 500, y: 540, w: 180, h: 90, safe: true },
  { id: 'bloque_c', label: 'Bloque C', x: 690, y: 230, w: 120, h: 100 },
  { id: 'bloque_d', label: 'Bloque D', x: 690, y: 410, w: 120, h: 100 },
  { id: 'laboratorios', label: 'Laboratorios de Ingeniería', short: 'Laboratorios', x: 880, y: 140, w: 170, h: 120 },
  { id: 'auditorio', label: 'Auditorio', x: 880, y: 340, w: 150, h: 110 },
  { id: 'coliseo', label: 'Coliseo y zona deportiva', short: 'Coliseo', x: 860, y: 545, w: 210, h: 110 },
];

export const COLORS = [
  { id: 'negro', label: 'Negro', hex: '#16181d' },
  { id: 'blanco', label: 'Blanco', hex: '#f4f6fa' },
  { id: 'gris', label: 'Gris', hex: '#8a93a3' },
  { id: 'plateado', label: 'Plateado', hex: '#c3cad6' },
  { id: 'azul', label: 'Azul', hex: '#2563eb' },
  { id: 'azul_oscuro', label: 'Azul oscuro', hex: '#1e2a5a' },
  { id: 'celeste', label: 'Celeste', hex: '#7cc4ff' },
  { id: 'verde', label: 'Verde', hex: '#22a35a' },
  { id: 'amarillo', label: 'Amarillo', hex: '#f5c518' },
  { id: 'naranja', label: 'Naranja', hex: '#f07c1e' },
  { id: 'rojo', label: 'Rojo', hex: '#d9283b' },
  { id: 'rosado', label: 'Rosado', hex: '#f08cc0' },
  { id: 'morado', label: 'Morado', hex: '#7b4bd6' },
  { id: 'cafe', label: 'Café', hex: '#7a4e2d' },
  { id: 'beige', label: 'Beige', hex: '#d9c4a0' },
  { id: 'dorado', label: 'Dorado', hex: '#c9a227' },
  { id: 'multicolor', label: 'Multicolor', hex: null },
];

export const MATERIALS = [
  { id: 'plastico', label: 'Plástico' },
  { id: 'metal', label: 'Metal' },
  { id: 'textil', label: 'Textil' },
  { id: 'papel', label: 'Papel y cartón' },
  { id: 'vidrio', label: 'Vidrio' },
  { id: 'electronico', label: 'Electrónico (RAEE)' },
  { id: 'cuero', label: 'Cuero' },
  { id: 'caucho', label: 'Caucho' },
  { id: 'mixto', label: 'Mixto' },
];

export const FOUND_STATUS = {
  en_espera_entrega: 'En Espera de Entrega',
  en_custodia: 'En Custodia',
  en_devolucion: 'En proceso de devolución',
  devuelto: 'Devuelto',
  en_disposicion: 'En protocolo de disposición',
  clasificado_reciclaje: 'Clasificado para reciclaje',
  asignado_reciclaje: 'Asignado a reciclaje',
  reciclado: 'Reciclado',
  donado: 'Donado',
};

export const LOST_STATUS = {
  activo: 'Buscando',
  recuperado: 'Recuperado',
  cerrado: 'Cerrado',
};

/** Estados en los que un objeto encontrado todavía puede ser reclamado. */
export const CLAIMABLE = ['en_espera_entrega', 'en_custodia'];
/** Estados de un objeto encontrado que sigue físicamente en la oficina, sin destino final. */
export const IN_CUSTODY = ['en_custodia', 'en_disposicion', 'clasificado_reciclaje'];

export const isCategory = (v) => CATEGORIES.some((c) => c.id === v);
export const isZone = (v) => ZONES.some((z) => z.id === v);
export const isColor = (v) => COLORS.some((c) => c.id === v);
export const isMaterial = (v) => MATERIALS.some((m) => m.id === v);
export const zoneLabel = (id) => ZONES.find((z) => z.id === id)?.label ?? id;
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const colorLabel = (id) => COLORS.find((c) => c.id === id)?.label ?? id;
export const materialLabel = (id) => MATERIALS.find((m) => m.id === id)?.label ?? id;
export const statusLabel = (kind, s) => (kind === 'lost' ? LOST_STATUS : FOUND_STATUS)[s] ?? s;

// HU-16: sugerencia automática de material a partir del texto del reporte
const MATERIAL_HINTS = [
  ['metal', /\b(acero|metal|metalic[oa]|aluminio|inoxidable)\b/],
  ['plastico', /\b(termo|tomatodo|botella|cilindro|recipiente|tupper|lonchera|vaso|plastic[oa]|taper|portacomida)\b/],
  ['electronico', /\b(celular|telefono|portatil|laptop|audifonos|cargador|cable|calculadora|mouse|teclado|tablet|usb|powerbank)\b/],
  ['textil', /\b(chaqueta|buzo|saco|camisa|camiseta|gorra|bufanda|sueter|hoodie|sombrilla|paraguas|morral|maleta|bolso|tela)\b/],
  ['papel', /\b(cuaderno|libro|libreta|agenda|carpeta|fotocopias|block)\b/],
  ['cuero', /\b(billetera|cuero|cinturon|correa)\b/],
  ['vidrio', /\b(vidrio|gafas|lentes|anteojos)\b/],
  ['caucho', /\b(balon|pelota|caucho|chanclas)\b/],
];

export function suggestMaterial(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [material, re] of MATERIAL_HINTS) if (re.test(t)) return material;
  return null;
}
