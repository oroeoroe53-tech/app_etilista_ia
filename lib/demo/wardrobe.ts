import type { WardrobeItem } from '@/lib/outfits/types'
import type { Category, Color, Fit, Material, Pattern, Season, Style } from '@/lib/wardrobe/taxonomy'

/**
 * El armario de la demostración.
 *
 * Existe para responder a una pregunta que se hace un desconocido en cinco
 * segundos: *¿esto qué hace?* Antes había que crear una cuenta y subir fotos
 * para averiguarlo, y nadie hace las dos cosas por una aplicación que no ha
 * visto funcionar.
 *
 * Es un armario **de verdad**, no una captura: estas diecisiete prendas entran en
 * el mismo motor que las de cualquiera, y los looks que se ven en `/demo` los
 * compone ahí mismo. Si el motor empeora, la demostración empeora con él, que
 * es exactamente lo que debe pasar.
 *
 * Deliberadamente aparte del proveedor simulado de IA (`lib/ai/providers/mock`):
 * aquel existe para los tests y lleva rarezas a propósito —una prenda con
 * confianza baja, duplicados— que sirven para ejercitar casos límite y que en
 * un escaparate solo estorban.
 *
 * Nota: sin fotos. Los huecos se dibujan con la textura del diseño y el nombre
 * de la prenda, que es lo mismo que hace la aplicación mientras una foto no ha
 * llegado. Con diecisiete fotos de prenda sobre fondo limpio en `public/demo/`,
 * esto pasaría de explicarse a venderse.
 */

interface Seed {
  id: string
  category: Category
  primary_color: Color
  secondary?: Color[]
  pattern?: Pattern
  fit?: Fit
  material: Material
  styles: Style[]
  seasons: Season[]
  formality: number
  warmth: number
  timesWorn: number
}

/*
 * Un armario neutro y creíble: mucho negro, beis y azul marino, un verde oliva
 * como único color con carácter. Es el armario que más se repite en la vida
 * real, y además es el que mejor deja ver lo que hace el motor —con quince
 * colores chillones cualquier combinación parecería un acierto o un desastre
 * por motivos que no son los suyos.
 *
 * **Tiene que dar de sí en las cuatro estaciones.** La primera versión llevaba
 * un solo pantalón y un solo calzado de verano, así que en julio el motor solo
 * conseguía montar un look y la demostración se quedaba con dos huecos. Lo
 * encontró un test, no un desconocido en julio, que es la diferencia entre un
 * fallo y una anécdota. `tests/demo.test.ts` lo comprueba mes a mes.
 */
const SEEDS: Seed[] = [
  // Arriba
  { id: 'demo-01', category: 'tshirt', primary_color: 'black', fit: 'oversized', material: 'cotton', styles: ['minimal', 'casual'], seasons: ['spring', 'summer', 'autumn'], formality: 2, warmth: 2, timesWorn: 14 },
  { id: 'demo-02', category: 'tshirt', primary_color: 'white', material: 'cotton', styles: ['minimal', 'casual'], seasons: ['spring', 'summer'], formality: 2, warmth: 1, timesWorn: 9 },
  { id: 'demo-03', category: 'shirt', primary_color: 'white', material: 'cotton', styles: ['minimal', 'business'], seasons: ['spring', 'summer', 'autumn'], formality: 4, warmth: 2, timesWorn: 5 },
  { id: 'demo-04', category: 'polo', primary_color: 'navy', material: 'cotton', styles: ['preppy', 'casual'], seasons: ['spring', 'summer'], formality: 3, warmth: 2, timesWorn: 8 },
  { id: 'demo-05', category: 'sweater', primary_color: 'grey', fit: 'relaxed', material: 'knit', styles: ['minimal', 'casual'], seasons: ['autumn', 'winter'], formality: 3, warmth: 4, timesWorn: 11 },
  { id: 'demo-06', category: 'hoodie', primary_color: 'beige', fit: 'oversized', material: 'cotton', styles: ['streetwear', 'casual'], seasons: ['autumn', 'winter'], formality: 2, warmth: 4, timesWorn: 7 },

  // Abajo
  { id: 'demo-07', category: 'jeans', primary_color: 'navy', pattern: 'denim', material: 'denim', styles: ['casual'], seasons: ['spring', 'summer', 'autumn', 'winter'], formality: 3, warmth: 3, timesWorn: 22 },
  { id: 'demo-08', category: 'jeans', primary_color: 'black', pattern: 'denim', fit: 'slim', material: 'denim', styles: ['casual', 'minimal'], seasons: ['autumn', 'winter'], formality: 3, warmth: 3, timesWorn: 13 },
  { id: 'demo-09', category: 'chinos', primary_color: 'beige', fit: 'slim', material: 'cotton', styles: ['minimal', 'preppy'], seasons: ['spring', 'summer', 'autumn'], formality: 4, warmth: 2, timesWorn: 6 },
  { id: 'demo-10', category: 'shorts', primary_color: 'olive', material: 'cotton', styles: ['casual'], seasons: ['summer'], formality: 2, warmth: 1, timesWorn: 12 },
  { id: 'demo-11', category: 'trousers', primary_color: 'navy', material: 'wool', styles: ['business', 'elegant'], seasons: ['spring', 'autumn', 'winter'], formality: 5, warmth: 3, timesWorn: 2 },

  // Abrigo
  { id: 'demo-12', category: 'jacket', primary_color: 'olive', material: 'synthetic', styles: ['casual', 'streetwear'], seasons: ['spring', 'autumn', 'winter'], formality: 3, warmth: 4, timesWorn: 8 },
  { id: 'demo-13', category: 'coat', primary_color: 'black', material: 'wool', styles: ['minimal', 'elegant'], seasons: ['winter'], formality: 4, warmth: 5, timesWorn: 4 },

  // Calzado
  { id: 'demo-14', category: 'sneakers', primary_color: 'white', secondary: ['grey'], material: 'synthetic', styles: ['casual', 'minimal'], seasons: ['spring', 'summer', 'autumn'], formality: 2, warmth: 2, timesWorn: 26 },
  { id: 'demo-15', category: 'shoes', primary_color: 'brown', material: 'leather', styles: ['elegant', 'business'], seasons: ['spring', 'summer', 'autumn'], formality: 4, warmth: 2, timesWorn: 5 },
  { id: 'demo-16', category: 'boots', primary_color: 'brown', material: 'leather', styles: ['elegant', 'casual'], seasons: ['autumn', 'winter'], formality: 4, warmth: 4, timesWorn: 3 },

  // Accesorio
  { id: 'demo-17', category: 'belt', primary_color: 'brown', material: 'leather', styles: ['casual', 'elegant'], seasons: ['spring', 'summer', 'autumn', 'winter'], formality: 3, warmth: 1, timesWorn: 10 },
]


/**
 * Cuándo se puso cada prenda por última vez.
 *
 * El motor penaliza lo llevado hace poco, así que sin fechas todas competirían
 * en igualdad y la demostración enseñaría siempre el mismo look. Las fechas se
 * calculan hacia atrás desde hoy —no son constantes— para que la demostración
 * no envejezca: dentro de tres meses seguirá siendo "hace nueve días".
 */
function lastWorn(index: number, today: Date): string | null {
  if (index % 5 === 4) return null // alguna sin estrenar
  const days = 4 + ((index * 9) % 40)
  return new Date(today.getTime() - days * 86_400_000).toISOString()
}

export function demoWardrobe(today: Date = new Date()): WardrobeItem[] {
  return SEEDS.map((seed, index) => ({
    id: seed.id,
    category: seed.category,
    primary_color: seed.primary_color,
    secondary_colors: seed.secondary ?? [],
    pattern: seed.pattern ?? 'solid',
    fit: seed.fit ?? 'regular',
    material: seed.material,
    styles: seed.styles,
    seasons: seed.seasons,
    formality: seed.formality,
    warmth: seed.warmth,
    is_available: true,
    last_worn_at: lastWorn(index, today),
    times_worn: seed.timesWorn,
  }))
}
