import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { buildRecap, monthName } from '@/lib/social/recap'
import { countChallengesDone } from '@/lib/challenges/queries'
import { describeGarment } from '@/lib/wardrobe/labels'
import { BackLink, EmptyState } from '@/components/ui'
import { ShareRecap } from '@/components/social/ShareRecap'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Tu mes · Estilista' }

/**
 * El resumen del mes.
 *
 * Todo sale de datos que ya estaban: días que te vestiste con lo que te
 * propuse, la racha más larga, los retos que completaste y la prenda que más
 * has usado. **Ni una tabla ni un contador nuevos** — un resumen con sus
 * propios contadores acaba enseñando números que no cuadran con el diario.
 *
 * Y la prenda estrella es la más puesta, no la más cara ni la más nueva: aquí
 * no hay nada de lo que presumir por haber comprado.
 */
export default async function RecapPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const firstDay = `${month}-01`

  const [{ data: worn }, challengesDone] = await Promise.all([
    supabase
      .from('wear_history')
      .select('worn_on, clothing_item_id, clothing_items(category, primary_color, fit, pattern)')
      .eq('user_id', user.id)
      .gte('worn_on', firstDay),
    countChallengesDone(user.id, month),
  ])

  type Row = {
    worn_on: string
    clothing_item_id: string
    clothing_items: {
      category: string
      primary_color: string
      fit: string | null
      pattern: string | null
    } | null
  }

  const rows = (worn ?? []) as unknown as Row[]

  const names = new Map<string, string>()
  for (const row of rows) {
    if (row.clothing_items) names.set(row.clothing_item_id, describeGarment(row.clothing_items))
  }

  const recap = buildRecap({
    worn: rows.map((row) => ({ day: row.worn_on, itemId: row.clothing_item_id })),
    names,
    challengesDone,
  })

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Tu {monthName(now)} · estilista</p>
        <h1 className="display text-[34px] leading-[1.02]">
          {recap.days} {recap.days === 1 ? 'día' : 'días'}
          <span className="display-italic block">sin pensar qué ponerte</span>
        </h1>
      </header>

      {recap.empty ? (
        <EmptyState
          title="El mes está en blanco"
          body="Marca como puesto lo que te propongo y aquí aparecerá tu mes: los días, la racha y la prenda que más has usado."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5">
            <Figure value={recap.bestStreak} label="racha máxima" />
            <Figure value={recap.challengesDone} label="retos completados" />
          </section>

          {recap.star ? (
            <section className="mt-8">
              <p className="eyebrow mb-3">Tu prenda estrella</p>
              <div className="rounded-[var(--radius-card)] border border-line p-4">
                <p className="display text-[23px]">{recap.star.name}</p>
                <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-soft">
                  Puesta {recap.star.times} veces este mes. La que más.
                </p>
              </div>
            </section>
          ) : null}

          <section className="mt-9">
            <ShareRecap
              text={`Este ${monthName(now)} me he vestido ${recap.days} días sin pensar qué ponerme. Racha máxima: ${recap.bestStreak}.`}
            />
            {/*
              El diseño pedía vídeo para Stories y TikTok. No lo hay, y decirlo
              es mejor que fingirlo: lo que se comparte es texto, y no lleva tu
              nombre ni tus fotos a ninguna parte.
            */}
            <p className="mt-3 text-center text-[10.5px] leading-[1.5] text-ink-faint">
              Se comparte como texto. No sale tu nombre ni ninguna foto tuya.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-raised p-4 text-center shadow-card-soft">
      <p className="display text-[40px] leading-[0.95] tabular-nums">{value}</p>
      <p className="eyebrow mt-2">{label}</p>
    </div>
  )
}
