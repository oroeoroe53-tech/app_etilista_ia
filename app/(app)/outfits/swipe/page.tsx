import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { fromStored } from '@/lib/style/profile'
import { buildDeck } from '@/lib/outfits/deck'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/labels'
import { SwipeDeck, type SwipeCard } from '@/components/outfits/SwipeDeck'
import { Screen, EmptyState, Button, Notice, BackLink } from '@/components/ui'

export const metadata = { title: 'Descubre · Estilista' }
export const dynamic = 'force-dynamic'

/*
 * La única pantalla negra.
 *
 * El color de la barra del sistema se declara por ruta para que el teléfono se
 * oscurezca con ella; si no, quedaría una franja crema arriba delatando que el
 * negro es solo un div.
 */
export const viewport = { themeColor: '#15140f' }

/**
 * Envoltorio oscuro.
 *
 * `on-dark` redefine las variables de color para todo el subárbol: ni un solo
 * componente de dentro sabe que está sobre negro. `min-h-dvh` es lo que evita
 * que el fondo se corte si la baraja es corta.
 */
function Dark({ children }: { children: React.ReactNode }) {
  return <div className="on-dark min-h-dvh">{children}</div>
}

interface ItemRow {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  image_path: string | null
}

export default async function SwipePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: profileRow }, permiso] = await Promise.all([
    supabase.from('style_profile').select('*').eq('user_id', user.id).maybeSingle(),
    checkEntitlement(user.id, 'swipe'),
  ])

  if (!permiso.allowed) {
    return (
      <Dark>
        <Screen>
          <BackLink href="/outfits">outfits</BackLink>
          <header className="pt-4 pb-6">
            <p className="eyebrow mb-2.5">Descubre</p>
            <h1 className="display text-[30px]">Por hoy ya está</h1>
          </header>
          <Notice>
            Has valorado {permiso.used} looks hoy. Mañana volvemos a empezar.
          </Notice>
          <div className="mt-6">
            <Link href="/estilo" className="block">
              <Button variant="secondary" fullWidth>
                Ver cómo te veo ahora
              </Button>
            </Link>
          </div>
        </Screen>
      </Dark>
    )
  }

  const deck = await buildDeck(supabase, user.id, fromStored(profileRow as never))

  if (deck.cards.length === 0) {
    return (
      <Dark>
        <Screen>
          <BackLink href="/outfits">outfits</BackLink>
          <header className="pt-4 pb-6">
            <p className="eyebrow mb-2.5">Descubre</p>
            <h1 className="display text-[30px]">Aún no</h1>
          </header>
          <EmptyState
            title="Me falta armario"
            body="Con unas pocas prendas más podré montar combinaciones que merezca la pena enseñarte."
            action={
              <Link href="/armario/nueva" className="block">
                <Button fullWidth>Añadir prendas</Button>
              </Link>
            }
          />
        </Screen>
      </Dark>
    )
  }

  // Una sola consulta y una sola firma de URLs para toda la baraja.
  const itemIds = [...new Set(deck.cards.flatMap((card) => card.itemIds))]

  const { data: itemRows } = await supabase
    .from('clothing_items')
    .select('id, category, primary_color, fit, pattern, image_path')
    .in('id', itemIds)

  const items = new Map(((itemRows ?? []) as unknown as ItemRow[]).map((i) => [i.id, i]))

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [...items.values()].map((i) => i.image_path).filter((p): p is string => Boolean(p)),
    user.id,
  )

  const cards: SwipeCard[] = deck.cards.map((card) => ({
    key: card.key,
    itemIds: card.itemIds,
    title: card.title,
    items: card.itemIds
      .map((id) => items.get(id))
      .filter((item): item is ItemRow => Boolean(item))
      .map((item) => ({
        id: item.id,
        name: describeGarment(item),
        imageUrl: item.image_path ? (signed.get(item.image_path) ?? null) : null,
      })),
  }))

  return (
    <Dark>
      <Screen>
        <BackLink href="/outfits">outfits</BackLink>

        <header className="pt-4 pb-5">
          <p className="eyebrow mb-2.5">Descubre</p>
          <h1 className="display text-[30px]">¿Te pondrías esto?</h1>
          <p className="mt-2.5 text-[11.5px] leading-[1.5] text-ink-soft">
            No busco acertar: busco entenderte. Un “no” me enseña tanto como un “sí”.
          </p>
        </header>

        {deck.exhausted ? (
          <div className="mb-5">
            <Notice>
              Ya has valorado casi todo lo que puedo montar con tu armario. Te repito
              algunos: si cambias de opinión, sustituyo lo anterior.
            </Notice>
          </div>
        ) : null}

        <SwipeDeck cards={cards} />
      </Screen>
    </Dark>
  )
}
