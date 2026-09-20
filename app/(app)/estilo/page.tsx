import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { fromStored, confidence } from '@/lib/style/profile'
import { describeProfile, COLOR_SWATCHES } from '@/lib/style/describe'
import { rebuildStyleProfile } from '@/lib/style/rebuild'
import { colorLabel } from '@/lib/wardrobe/labels'
import { findGaps } from '@/lib/wardrobe/gaps'
import { Screen, PageTitle, EmptyState, Button, Meter } from '@/components/ui'
import { PreferencesForm } from '@/components/style/PreferencesForm'

export const dynamic = 'force-dynamic'

/**
 * Estilo.
 *
 * La pantalla más delicada del producto en cuanto a tono. Lo que se enseña es un
 * retrato en castellano, no un panel de métricas: si la persona lee números,
 * piensa "me están midiendo" en vez de "esto me ha entendido" (PLAN.md §42).
 *
 * Las únicas cifras de la pantalla son las barras de "lo que te falta", y esas
 * sí son números contados —tres prendas de invierno de las cuatro que harían
 * falta— no una puntuación sobre la persona.
 */
export default async function StylePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: stored }, { data: prefs }, { count: itemCount }, { data: wardrobe }] =
    await Promise.all([
      supabase.from('style_profile').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('clothing_items')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase
        .from('clothing_items')
        .select('category, formality, warmth, seasons, is_available')
        .is('deleted_at', null),
    ])

  // Huecos del armario: qué combinación falta para que lo que ya hay funcione.
  // Todo sale de contar lo que existe, sin IA.
  const gaps = findGaps((wardrobe ?? []) as never[])

  let profile = fromStored(stored as never)

  // Si hay armario pero el perfil está en blanco, es que nunca se calculó.
  // Se hace ahora en lugar de enseñar una pantalla vacía que no explica nada.
  if ((itemCount ?? 0) > 0 && profile.signalCount === 0) {
    profile = await rebuildStyleProfile(user.id)
  }

  const portrait = describeProfile(profile)
  const level = confidence(profile)

  const preferences = (prefs ?? {}) as {
    disliked_colors?: string[]
    default_formality?: number | null
  }

  if ((itemCount ?? 0) === 0) {
    return (
      <Screen>
        <PageTitle eyebrow="Cómo te veo" title="Estilo" />
        <EmptyState
          title="Todavía no te conozco"
          body="Enséñame unas fotos de looks que lleves y empezaré a entender cómo vistes."
          action={
            <Link href="/onboarding" className="block">
              <Button fullWidth>Enséñame cómo vistes</Button>
            </Link>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <header className="pt-5 pb-5">
        <p className="eyebrow mb-2.5">Cómo te veo</p>
        <h1 className="display text-[2rem]">
          {portrait.headline}
          {portrait.headlineSecond ? (
            <span className="display-italic block text-ink-faint">{portrait.headlineSecond}</span>
          ) : null}
        </h1>
      </header>

      {/* --- El retrato ---------------------------------------------------- */}
      <section className="mb-9">
        {portrait.colors.length > 0 ? (
          <ul className="mb-5 flex gap-4" aria-label="Tus colores habituales">
            {portrait.colors.map((color) => (
              <li key={color} className="flex flex-col items-center gap-1.5">
                <span
                  className="block h-11 w-11 rounded-full border border-line"
                  style={{ backgroundColor: COLOR_SWATCHES[color] ?? '#999' }}
                  aria-hidden
                />
                <span className="text-[10px] text-ink-faint">{colorLabel(color)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-1">
          {portrait.lines.map((line) => (
            <p key={line} className="text-[13px] leading-[1.7] text-ink-soft">
              {line}
            </p>
          ))}
        </div>

        {portrait.caveat ? (
          <p className="mt-5 border-l-2 border-line pl-3.5 text-[11.5px] leading-[1.5] text-ink-soft">
            {portrait.caveat}
          </p>
        ) : null}
      </section>

      {level !== 'established' ? (
        <section className="mb-9">
          <p className="eyebrow mb-3">Cómo afinarlo</p>
          <ul className="space-y-2.5 text-[11.5px] leading-[1.5] text-ink-soft">
            <Tip href="/onboarding">Analiza más fotos de looks que ya lleves.</Tip>
            <Tip href="/armario">Corrige las prendas que no describí bien.</Tip>
            <Tip href="/outfits/swipe">Valora combinaciones y dime cuáles no van contigo.</Tip>
          </ul>
        </section>
      ) : null}

      {/* --- Lo que te falta ----------------------------------------------- */}
      {gaps.length > 0 ? (
        <section className="mb-9">
          <p className="eyebrow mb-3">Lo que te falta</p>
          <p className="mb-4 text-[11.5px] leading-[1.5] text-ink-soft">
            No es una lista de la compra: son las piezas que impiden que lo que ya
            tienes funcione del todo.
          </p>

          <ul className="space-y-2.5">
            {gaps.slice(0, 4).map((gap) => (
              <li
                key={`${gap.kind}-${gap.title}`}
                className="rounded-[20px] border border-line p-4"
              >
                <p className="display text-[17px]">{gap.title}</p>
                <p className="mt-1.5 mb-3 text-[11.5px] leading-[1.5] text-ink-soft">
                  {gap.detail}
                </p>
                <Meter
                  value={gap.coverage * 100}
                  label={`Cubierto: ${gap.title}`}
                  tone="clay"
                  className="h-1"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Colores que no me pongo ---------------------------------------- */}
      <section>
        <p className="eyebrow mb-3">Colores que no me pongo</p>
        <p className="mb-4 text-[11.5px] leading-[1.5] text-ink-soft">
          Esto manda sobre lo que yo deduzca. Si marcas un color aquí, no te lo propondré
          aunque lo tengas en el armario.
        </p>
        <PreferencesForm
          dislikedColors={preferences.disliked_colors ?? []}
          defaultFormality={preferences.default_formality ?? null}
        />
      </section>
    </Screen>
  )
}

function Tip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex gap-3 underline-offset-4 hover:underline">
        <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
        {children}
      </Link>
    </li>
  )
}
