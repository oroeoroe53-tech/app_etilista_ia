import type { SupabaseClient } from '@supabase/supabase-js'
import type { StyleProfile } from '@/lib/style/profile'
import { nameOutfit } from './name'
import { generateOutfits } from './engine'
import { loadWardrobe } from './persist'
import { seasonOf } from './filters'
import type { ScoredOutfit, WardrobeItem } from './types'

/**
 * La baraja del swipe.
 *
 * Dos diferencias importantes respecto a "¿qué me pongo?":
 *
 * 1. Aquí no se busca *el* mejor look, se busca variedad. El objetivo no es
 *    acertar, es aprender: un look que la persona rechaza enseña tanto como uno
 *    que le encanta (PLAN.md §17).
 *
 * 2. Los looks **no se guardan al generarlos**. Se guardan solo cuando la
 *    persona reacciona a uno. Escribir doce filas para una baraja que quizá
 *    abandone al segundo deslizamiento es basura en la base de datos.
 */

/** Firma estable de un conjunto de prendas. Sirve para no repetir lo ya valorado. */
export function outfitSignature(itemIds: readonly string[]): string {
  return [...itemIds].sort().join('|')
}

export interface DeckCard {
  /** Identificador de la carta dentro de esta baraja. No existe en la base de datos. */
  key: string
  itemIds: string[]
  /** Titular corto del look. Se calcula aquí, donde todavía hay prendas enteras. */
  title: string
  highlights: string[]
  score: number
}

export interface Deck {
  cards: DeckCard[]
  /** `true` si ya ha valorado prácticamente todo lo que se puede componer. */
  exhausted: boolean
}

const POOL_SIZE = 40
const DECK_SIZE = 12

/**
 * Construye una baraja evitando lo que ya se ha valorado.
 *
 * El motor es determinista, así que sin este filtro cada sesión enseñaría
 * exactamente las mismas cartas y no se aprendería nada nuevo.
 */
export async function buildDeck(
  supabase: SupabaseClient,
  userId: string,
  profile: StyleProfile,
  options: { size?: number; today?: Date } = {},
): Promise<Deck> {
  const size = options.size ?? DECK_SIZE
  const today = options.today ?? new Date()

  const wardrobe = await loadWardrobe(supabase, userId)
  if (wardrobe.length === 0) return { cards: [], exhausted: false }

  const rated = await loadRatedSignatures(supabase, userId)

  const result = generateOutfits({
    wardrobe,
    profile,
    // Contexto deliberadamente vacío salvo la temporada: aquí se pregunta por el
    // gusto, no por lo que le viene bien hoy a las siete de la tarde.
    context: { season: seasonOf(today), today },
    count: POOL_SIZE,
  })

  const fresh = result.outfits.filter(
    (outfit) => !rated.has(outfitSignature(outfit.items.map((i) => i.id))),
  )

  // Si ya ha valorado todo, se vuelven a ofrecer las mejores: es preferible
  // repetir a enseñar una pantalla vacía. Opinar de nuevo sustituye lo anterior.
  const source = fresh.length > 0 ? fresh : result.outfits

  return {
    cards: source.slice(0, size).map(toCard),
    exhausted: fresh.length === 0 && result.outfits.length > 0,
  }
}

function toCard(outfit: ScoredOutfit): DeckCard {
  const itemIds = outfit.items.map((item: WardrobeItem) => item.id)
  return {
    key: outfitSignature(itemIds),
    itemIds,
    title: nameOutfit(outfit.items),
    highlights: outfit.highlights,
    score: outfit.score,
  }
}

async function loadRatedSignatures(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('outfits')
    .select('context')
    .eq('user_id', userId)
    .not('context->>signature', 'is', null)
    .limit(500)

  const signatures = new Set<string>()
  for (const row of (data ?? []) as Array<{ context: { signature?: string } | null }>) {
    if (row.context?.signature) signatures.add(row.context.signature)
  }
  return signatures
}
