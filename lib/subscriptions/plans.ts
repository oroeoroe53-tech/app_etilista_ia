/**
 * CONFIGURACIÓN DE PLANES — archivo único.
 *
 * Todos los números que definen qué puede hacer cada plan están aquí y solo aquí
 * (PLAN.md §8). Ningún límite debe aparecer escrito en un componente, una ruta
 * ni una consulta. Cambiar el plan Free es editar este archivo, no migrar la
 * base de datos.
 *
 * Ningún plan es "ilimitado": incluso el más amplio tiene techo técnico, para
 * proteger el coste y evitar abuso.
 */

export type PlanId = 'free' | 'pro'

export type Feature =
  | 'analyze_outfit'
  | 'add_clothing_item'
  | 'request_outfits'
  | 'swipe'
  | 'generate_tryon'
  | 'advanced_stylist'

export type Period = 'day' | 'month' | 'total'

/** Cómo se mide cada funcionalidad. */
export const FEATURE_METRICS: Record<Feature, { metric: string; period: Period }> = {
  analyze_outfit: { metric: 'ai_analyses', period: 'month' },
  add_clothing_item: { metric: 'wardrobe_items', period: 'total' },
  request_outfits: { metric: 'outfit_requests', period: 'day' },
  swipe: { metric: 'swipes', period: 'day' },
  generate_tryon: { metric: 'tryon', period: 'month' },
  advanced_stylist: { metric: 'advanced_stylist', period: 'total' },
}

/**
 * `add_clothing_item` no se mide con un contador acumulado sino contando las
 * prendas vivas del armario: si el usuario borra una prenda, recupera el hueco.
 * Un contador que solo sube sería injusto.
 */
export const COUNTED_FROM_TABLE: ReadonlySet<Feature> = new Set(['add_clothing_item'])

export const PLAN_LIMITS: Record<PlanId, Record<Feature, number>> = {
  free: {
    analyze_outfit: 5,
    add_clothing_item: 40,
    request_outfits: 10,
    swipe: 100,
    generate_tryon: 0,
    advanced_stylist: 0,
  },
  pro: {
    analyze_outfit: 60,
    add_clothing_item: 300,
    request_outfits: 100,
    swipe: 500,
    generate_tryon: 20,
    advanced_stylist: 1,
  },
}

/** Fotos admitidas en el onboarding. */
export const ONBOARDING_PHOTOS: Record<PlanId, { min: number; max: number }> = {
  free: { min: 3, max: 6 },
  pro: { min: 3, max: 20 },
}

/** Tamaño y tipos admitidos en las subidas. También se valida en Storage (0003). */
export const UPLOAD_RULES = {
  maxBytes: 10 * 1024 * 1024,
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  /** Lado largo al que se reduce en el navegador antes de subir (PLAN.md §6). */
  clientMaxEdge: 1280,
  clientQuality: 0.82,
  /** Lado largo de la copia que se manda al modelo de visión. */
  aiMaxEdge: 768,
} as const

export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Gratis',
  pro: 'Completo',
}

/**
 * Precio mensual, en euros.
 *
 * Vive aquí por la misma razón que los límites: el precio es parte de la
 * definición del plan, y escribirlo suelto en la pantalla de Perfil es la
 * manera segura de que algún día diga una cosa distinta de la que se cobra.
 */
export const PLAN_PRICES: Record<PlanId, number> = {
  free: 0,
  pro: 3.99,
}

/** Formato español: 3,99 €. */
export function formatPrice(plan: PlanId): string {
  return PLAN_PRICES[plan].toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export function limitFor(plan: PlanId, feature: Feature): number {
  return PLAN_LIMITS[plan][feature]
}

/**
 * Clave del periodo ya resuelta, tal como se guarda en `usage_counters`.
 * Un solo formato de tabla sirve para límites diarios, mensuales y totales.
 */
export function periodKey(period: Period, now: Date = new Date()): string {
  if (period === 'total') return 'all'
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  if (period === 'month') return `${y}-${m}`
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
