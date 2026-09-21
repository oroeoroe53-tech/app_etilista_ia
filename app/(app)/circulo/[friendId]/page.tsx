import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listCircle } from '@/lib/circle/queries'
import { composeBorrowedLook } from '@/lib/circle/borrowed-look'
import { getSharedWardrobe } from '@/lib/wardrobe/shared'
import { describeGarment } from '@/lib/wardrobe/labels'
import { setGrant, removeFriend } from '../actions'
import { BackLink, PhotoSlot } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export const dynamic = 'force-dynamic'

/**
 * Una persona del círculo.
 *
 * Tiene dos mitades y las dos importan:
 *
 *  · **Lo que ella te deja ver**, arriba, empezando por un look montado con su
 *    ropa para tu estilo. Es la razón por la que alguien entra aquí.
 *  · **Lo que tú le dejas ver**, abajo. El dial vive en esta pantalla y ya no
 *    en la lista: en la lista eran cinco diales seguidos, que invita a tocarlos
 *    sin mirar; aquí es una decisión sobre una persona concreta.
 */
export default async function FriendPage({
  params,
}: {
  params: Promise<{ friendId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { friendId } = await params

  // La lista es la fuente de la verdad sobre quién está en el círculo: si no
  // sale aquí, esta pantalla no existe.
  const member = (await listCircle(user.id)).find((m) => m.id === friendId)
  if (!member) notFound()

  const [look, wardrobe] = await Promise.all([
    member.theyGive ? composeBorrowedLook(friendId, user.id) : null,
    member.theyGive ? getSharedWardrobe(friendId, user.id) : null,
  ])

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/circulo">mis amigas</BackLink>

      <header className="flex items-center gap-3.5 pt-3 pb-1">
        <span
          aria-hidden
          className="display flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sunken text-[24px]"
        >
          {member.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="display truncate text-[26px]">{member.name}</h1>
          <p className="mt-1 text-[10.5px] text-ink-soft">
            {wardrobe
              ? `Armario compartido contigo · ${wardrobe.items.length} ${
                  wardrobe.items.length === 1 ? 'prenda' : 'prendas'
                }`
              : 'No te deja ver su armario'}
          </p>
        </div>
      </header>

      {/* --- Vísteme con tu armario ------------------------------------------ */}
      {look ? (
        <section className="mt-6 rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
          <p className="eyebrow mb-3 text-clay">Vísteme con tu armario</p>

          <div className="flex h-[168px] gap-1.5">
            <PhotoSlot
              src={look.garments[0]?.imageUrl ?? null}
              label={look.garments[0]?.label ?? ''}
              showLabel={false}
              className="min-w-0 flex-[1.4] rounded-[20px]"
            />
            {look.garments.length > 1 ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {look.garments.slice(1, 4).map((garment) => (
                  <PhotoSlot
                    key={garment.id}
                    src={garment.imageUrl}
                    label={garment.label}
                    showLabel={false}
                    className="min-h-0 flex-1 rounded-[20px]"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <p className="display mt-3.5 text-[21px]">{look.name}</p>
          <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-soft">
            {/*
              La frase dice de quién es la ropa y de quién es el gusto, porque
              es lo que hace que la propuesta se entienda: no es «lo que tiene
              Marta», es «lo de Marta que te pega a ti».
            */}
            Con la ropa de {member.name}, elegido para tu estilo.
            {look.hero ? ` ${capitalize(look.hero.label)} es lo que hace el look, y no lo tienes.` : ''}
            {look.why ? ` ${capitalize(look.why)}.` : ''}
          </p>

          {look.hero ? (
            <div className="mt-3.5 flex gap-2.5">
              <Link
                href={`/armario/de/${friendId}/${look.hero.id}`}
                className="flex h-[46px] flex-1 items-center justify-center rounded-full bg-accent px-5 text-[12px] font-medium text-accent-ink"
              >
                Pedirle {look.hero.label.toLowerCase()}
              </Link>
              <Link
                href={`/armario/de/${friendId}`}
                className="flex h-[46px] shrink-0 items-center justify-center rounded-full border border-line px-[18px] text-[12px] font-medium"
              >
                Otro
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* --- Lo que te deja ver ---------------------------------------------- */}
      {wardrobe && wardrobe.items.length > 0 ? (
        <section className="mt-8">
          <p className="eyebrow mb-3">Lo que te deja ver</p>
          <ul className="grid grid-cols-3 gap-2">
            {wardrobe.items.slice(0, 9).map((item) => (
              <li key={item.id}>
                <Link href={`/armario/de/${friendId}/${item.id}`}>
                  <PhotoSlot
                    src={item.imageUrl}
                    label={describeGarment(item)}
                    showLabel={false}
                    className={cn('aspect-[3/4] rounded-2xl', item.onLoan && 'opacity-40')}
                  />
                </Link>
              </li>
            ))}
          </ul>
          {wardrobe.items.length > 9 ? (
            <Link
              href={`/armario/de/${friendId}`}
              className="mono mt-3 inline-block text-ink-soft underline underline-offset-4"
            >
              ver las {wardrobe.items.length} →
            </Link>
          ) : null}
        </section>
      ) : null}

      {/* --- Lo que tú le dejas ver ------------------------------------------ */}
      <section className="mt-9 border-t border-line pt-7">
        <p className="eyebrow mb-3">Lo que tú le dejas ver</p>

        <form action={setGrant} className="flex gap-1.5">
          <input type="hidden" name="friendId" value={member.id} />
          {(
            [
              { value: 'none', label: 'Nada' },
              { value: 'view', label: 'Ve mi ropa' },
              { value: 'style', label: 'Y me viste' },
            ] as const
          ).map((level) => {
            const current = member.iGive ?? 'none'
            return (
              <button
                key={level.value}
                type="submit"
                name="level"
                value={level.value}
                aria-pressed={current === level.value}
                className={cn(
                  'rounded-full border px-3.5 py-[9px] text-[11.5px] transition-colors',
                  current === level.value
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-[color-mix(in_srgb,var(--ink)_16%,transparent)] text-ink-soft',
                )}
              >
                {level.label}
              </button>
            )
          })}
        </form>

        <p className="mt-3 text-[10.5px] leading-[1.6] text-ink-faint">
          {member.iGive === 'style'
            ? `${member.name} ve tu armario y puede montarte looks con tu ropa.`
            : member.iGive === 'view'
              ? `${member.name} ve tu armario y puede pedirte prendas prestadas.`
              : `${member.name} no ve nada de tu armario.`}{' '}
          Cambiarlo tiene efecto al instante y no le llega ningún aviso.
        </p>

        {/* Si ella te deja vestirla, el camino está aquí y no escondido. */}
        {member.theyGive === 'style' ? (
          <Link
            href={`/vestir/${friendId}`}
            className="mono mt-4 inline-block text-ink-soft underline underline-offset-4"
          >
            vestirla con su ropa →
          </Link>
        ) : null}

      </section>

      <form action={removeFriend} className="mt-8">
        <input type="hidden" name="friendId" value={member.id} />
        <button type="submit" className="w-full py-2 text-[11px] text-ink-faint">
          Quitar a {member.name} de mi círculo
        </button>
      </form>
    </div>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
