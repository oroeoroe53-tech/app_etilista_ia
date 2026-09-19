import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signOne } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { findNeglected, neglectMessage, neglectCutoffs } from '@/lib/wardrobe/neglected'
import { describeGarment } from '@/lib/wardrobe/labels'

/**
 * Portada.
 *
 * La pantalla de inicio no es un menú: es la portada de una revista. Cabecera
 * grande, fecha, y una fotografía a sangre ocupando todo. Las acciones siguen
 * estando donde estaban, pero lo primero que se ve al abrir es una imagen.
 *
 * La foto es **del propio usuario** —uno de sus looks o una prenda suya—, no
 * una imagen de archivo. Es la diferencia entre una portada y un cartel.
 */
export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const cutoffs = neglectCutoffs()

  const [{ data: profile }, { count: itemCount }, { data: photo }, { data: garment }, { data: forNeglect }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, onboarding_stage')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('clothing_items')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase
        .from('outfit_photos')
        .select('storage_path')
        .eq('analysis_status', 'done')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('clothing_items')
        .select('image_path')
        .is('deleted_at', null)
        .not('image_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      /*
       * Solo las candidatas a estar olvidadas, no el armario entero.
       *
       * Antes se traían las ochenta prendas para acabar enseñando una. Las
       * fechas de corte salen de las mismas reglas que luego deciden, así que
       * el filtro y la lógica no se pueden desajustar.
       */
      supabase
        .from('clothing_items')
        .select(
          'id, category, primary_color, fit, pattern, image_path, seasons, is_available, times_worn, last_worn_at, created_at',
        )
        .is('deleted_at', null)
        .eq('is_available', true)
        .or(`last_worn_at.lt.${cutoffs.lastWornBefore},last_worn_at.is.null`)
        .order('last_worn_at', { ascending: true, nullsFirst: false })
        .limit(40),
    ])

  const row = profile as { display_name?: string | null; onboarding_stage?: string } | null
  const name = row?.display_name ?? null
  const onboardingDone = row?.onboarding_stage === 'completed'
  const prendas = itemCount ?? 0

  // Se prefiere una foto de look completo; si no hay, el recorte de una prenda.
  const photoPath = (photo as { storage_path?: string } | null)?.storage_path
  const garmentPath = (garment as { image_path?: string } | null)?.image_path

  const coverUrl = photoPath
    ? await signOne(supabase, BUCKETS.outfitPhotos, photoPath, user.id)
    : garmentPath
      ? await signOne(supabase, BUCKETS.clothing, garmentPath, user.id)
      : null

  // Una sola prenda olvidada, la que más tiempo lleve. Una lista aquí sería ruido.
  const olvidadas = findNeglected((forNeglect ?? []) as never[], new Date(), 1)
  const olvidada = olvidadas[0] ?? null

  const today = new Date()
  const fecha = today
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  return (
    <div className="pb-nav">
      {/* --- Portada --------------------------------------------------- */}
      <section className="relative h-[78dvh] min-h-[30rem] w-full overflow-hidden">
        {coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt=""
              className="garment-photo absolute inset-0 h-full w-full object-cover"
            />
            {/* Degradado para que el texto se lea sobre cualquier foto. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/75"
            />
          </>
        ) : (
          <div aria-hidden className="absolute inset-0 bg-sunken" />
        )}

        <div
          className={`relative flex h-full flex-col justify-between px-5 pt-safe pb-8 ${
            coverUrl ? 'text-white' : 'text-ink'
          }`}
        >
          <header className="pt-8">
            <p
              className="text-[0.625rem] tracking-[0.24em]"
              style={{ opacity: coverUrl ? 0.75 : 0.5 }}
            >
              {fecha}
            </p>
            <h1 className="display mt-3 text-[3.25rem] leading-[0.92] tracking-tight">
              {name ?? 'Tu armario'}
            </h1>
          </header>

          <div>
            <div
              className="mb-5 h-px w-full"
              style={{ background: coverUrl ? 'rgba(255,255,255,0.35)' : 'var(--line)' }}
            />
            <p
              className="max-w-[18rem] text-sm leading-relaxed"
              style={{ opacity: coverUrl ? 0.85 : 0.6 }}
            >
              {prendas === 0
                ? 'Enséñame cómo vistes y empiezo a conocerte.'
                : `${prendas} ${prendas === 1 ? 'prenda' : 'prendas'} · todo lo que tienes, en un sitio`}
            </p>
          </div>
        </div>
      </section>

      {/* --- Acción principal ------------------------------------------ */}
      <section className="mx-auto w-full max-w-lg px-5">
        <Link
          href="/outfits/que-me-pongo"
          className="-mt-8 relative block bg-accent px-6 py-7 text-accent-ink shadow-[0_-12px_32px_rgba(0,0,0,0.18)]"
        >
          <span className="folio mb-2 block" style={{ color: 'inherit', opacity: 0.55 }}>
            AHORA MISMO
          </span>
          <span className="display block text-[2.5rem] leading-none">¿Qué me pongo?</span>
          <span className="mt-3 block text-sm opacity-70">
            Dime la ocasión y el tiempo. Yo pongo el resto.
          </span>
        </Link>

        {!onboardingDone ? (
          <Link href="/onboarding" className="mt-6 block border border-line bg-raised p-5">
            <span className="folio mb-2 block">01 — PRIMER PASO</span>
            <span className="display block text-2xl">Enséñame cómo vistes</span>
            <span className="mt-2 block text-sm leading-relaxed text-ink-soft">
              Cinco o seis fotos de looks que ya lleves. Valen las del espejo.
            </span>
          </Link>
        ) : null}

        {olvidada ? (
          <Link
            href={`/armario/${olvidada.id}`}
            className="mt-6 block border-l-2 border-accent bg-sunken/60 px-4 py-3"
          >
            <span className="folio mb-1 block">SE TE OLVIDA</span>
            <span className="block text-sm leading-relaxed text-ink-soft">
              {neglectMessage(olvidada, describeGarment(olvidada))}
            </span>
          </Link>
        ) : null}

        {/* --- Secciones ------------------------------------------------ */}
        <nav className="mt-10">
          <Section folio="I" title="Armario" href="/armario">
            {prendas === 0 ? 'Todavía vacío' : `${prendas} prendas`}
          </Section>
          <Section folio="II" title="Descubre" href="/outfits/swipe">
            Dime qué te pondrías y qué no
          </Section>
          <Section folio="III" title="Estilo" href="/estilo">
            Cómo te veo
          </Section>
          <Section folio="IV" title="Diario" href="/diario">
            Lo que te pusiste
          </Section>
          <Section folio="V" title="La maleta" href="/outfits/maleta">
            Qué meter para un viaje
          </Section>
        </nav>
      </section>
    </div>
  )
}

/**
 * Entrada de sección, maquetada como el sumario de una revista:
 * número romano, título grande, línea fina debajo.
 */
function Section({
  folio,
  title,
  href,
  children,
}: {
  folio: string
  title: string
  href: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className="block border-t border-line py-5 last:border-b">
      <div className="flex items-baseline gap-4">
        <span className="folio w-6 shrink-0">{folio}</span>
        <div className="min-w-0 flex-1">
          <span className="display block text-2xl">{title}</span>
          <span className="mt-0.5 block truncate text-sm text-ink-soft">{children}</span>
        </div>
        <span aria-hidden className="text-ink-faint">
          →
        </span>
      </div>
    </Link>
  )
}
