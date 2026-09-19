import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { fetchWeather } from '@/lib/weather/provider'
import { RequestForm } from '@/components/outfits/RequestForm'
import { Screen, Notice, Button, EmptyState } from '@/components/ui'

export const metadata = { title: '¿Qué me pongo? · Estilista' }
export const dynamic = 'force-dynamic'

export default async function WhatToWearPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: prefsRow }, { count: itemCount }, permiso] = await Promise.all([
    supabase.from('user_preferences').select('city, lat, lon').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('clothing_items')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),
    checkEntitlement(user.id, 'request_outfits'),
  ])

  const prefs = (prefsRow ?? {}) as { city?: string | null; lat?: number | null; lon?: number | null }
  const hasLocation = prefs.lat != null && prefs.lon != null

  // El tiempo se consulta aquí para poder enseñarlo ya en el formulario. Si la
  // API falla, `weather` queda en null y la persona lo mete a mano: la pantalla
  // funciona igual (PLAN.md §35).
  const weather = hasLocation ? await fetchWeather({ lat: prefs.lat!, lon: prefs.lon! }) : null

  if ((itemCount ?? 0) === 0) {
    return (
      <Screen>
        <header className="pt-8 pb-6">
          <h1 className="display text-4xl">¿Qué me pongo?</h1>
        </header>
        <EmptyState
          title="Primero necesito tu armario"
          body="Sin prendas no puedo proponerte nada. Enséñame unas fotos y lo monto en un minuto."
          action={
            <Link href="/onboarding">
              <Button>Enséñame cómo vistes</Button>
            </Link>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <header className="pt-8 pb-8">
        <p className="eyebrow mb-2">Ahora mismo</p>
        <h1 className="display text-4xl">¿Qué me pongo?</h1>
      </header>

      {!permiso.allowed ? (
        <div className="space-y-4">
          <Notice tone="error">
            Has llegado al límite de hoy: {permiso.used} de {permiso.limit} propuestas.
          </Notice>
          <p className="text-sm leading-relaxed text-ink-soft">
            Mañana vuelve a empezar de cero.
          </p>
          <Link href="/outfits">
            <Button variant="secondary" fullWidth>
              Ver lo que te propuse antes
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <RequestForm
            weather={
              weather
                ? {
                    temperatureC: weather.temperatureC,
                    description: weather.description,
                    rain: weather.rain,
                    city: prefs.city ?? null,
                  }
                : null
            }
            hasLocation={hasLocation}
          />

          {permiso.remaining <= 3 ? (
            <p className="mt-6 text-center text-xs text-ink-faint">
              Te quedan {permiso.remaining} propuestas hoy.
            </p>
          ) : null}
        </>
      )}
    </Screen>
  )
}
