'use client'

import { useState, useSyncExternalStore } from 'react'
import { Button, Chip, Notice } from '@/components/ui'

/**
 * Cómo llevarse la aplicación al móvil.
 *
 * Esta pantalla existe por un motivo muy concreto: cuando alguien llega desde
 * un anuncio, llega a una **web**. Si no encuentra en treinta segundos cómo
 * dejarla en su pantalla de inicio, no la instala nunca y la siguiente vez ya
 * no vuelve.
 *
 * Dos caminos, y el primero es mucho mejor que el segundo:
 *
 * 1. Chrome y Edge avisan con `beforeinstallprompt` de que la aplicación se
 *    puede instalar. Cuando eso pasa, aquí sale un botón y se acabó: nadie
 *    tiene que leer instrucciones.
 * 2. Safari no tiene esa API y nunca la tendrá. En iPhone hay que explicarlo
 *    paso a paso, y es justo donde más gente se pierde.
 *
 * Todo lo que se consulta del navegador —el sistema, si ya está instalada, si
 * se puede instalar— se lee con `useSyncExternalStore` y no con un efecto.
 * No es un capricho: son estados que viven fuera de React y que pueden cambiar
 * solos (se instala en otra pestaña, el navegador avisa tarde), y esta es la
 * herramienta que existe para eso.
 */

type Platform = 'ios' | 'android' | 'desktop'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    /** Lo guarda el script del layout, porque el evento llega antes que React. */
    __pwaPrompt?: InstallEvent
  }
}

const GUIDES: Record<Platform, { label: string; steps: string[]; note?: string }> = {
  ios: {
    label: 'iPhone o iPad',
    steps: [
      'Abre esta página en Safari.',
      'Toca el botón de compartir: el cuadrado con una flecha hacia arriba, abajo en el centro.',
      'Baja por la lista y toca «Añadir a pantalla de inicio».',
      'Toca «Añadir», arriba a la derecha.',
    ],
    note: 'En iPhone esto solo funciona desde Safari. Otros navegadores no ofrecen la opción, o la esconden.',
  },
  android: {
    label: 'Android',
    steps: [
      'Toca el menú del navegador: los tres puntos, arriba a la derecha.',
      'Toca «Instalar aplicación» o «Añadir a pantalla de inicio».',
      'Confirma.',
    ],
  },
  desktop: {
    label: 'Ordenador',
    steps: [
      'Mira al final de la barra de direcciones: sale un icono de instalar, una pantalla pequeña con una flecha.',
      'Púlsalo y confirma.',
    ],
    note: 'Si no aparece, está en el menú del navegador, como «Instalar Selyqo…». Firefox no lo permite.',
  },
}

/* --- Lecturas del navegador -------------------------------------------------
 * Las funciones van fuera del componente a propósito: `useSyncExternalStore`
 * vuelve a suscribirse cada vez que cambia la función que recibe.
 * -------------------------------------------------------------------------- */

/** El sistema y el navegador no cambian a mitad de visita. */
const nunca = () => () => {}

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios'
  // El iPad moderno se presenta como un Mac; lo delata el táctil.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  return 'desktop'
}

/** Cómo viene alguien que ha pinchado un anuncio dentro de otra aplicación. */
function detectInApp(): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|LinkedInApp/i.test(navigator.userAgent)
}

function subscribeInstallable(onChange: () => void) {
  window.addEventListener('pwa-installable', onChange)
  window.addEventListener('appinstalled', onChange)
  return () => {
    window.removeEventListener('pwa-installable', onChange)
    window.removeEventListener('appinstalled', onChange)
  }
}

const canInstall = () => Boolean(window.__pwaPrompt)

function subscribeStandalone(onChange: () => void) {
  const media = window.matchMedia('(display-mode: standalone)')
  media.addEventListener('change', onChange)
  window.addEventListener('appinstalled', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('appinstalled', onChange)
  }
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // Safari en iOS no implementa `display-mode`; tiene lo suyo.
  (navigator as { standalone?: boolean }).standalone === true

/* -------------------------------------------------------------------------- */

export function InstallGuide() {
  /*
   * En el servidor no hay navegador que preguntar, así que el tercer argumento
   * devuelve el valor neutro. Eso hace que el primer render del cliente
   * coincida con el del servidor y no haya salto de hidratación.
   */
  const detected = useSyncExternalStore(nunca, detectPlatform, () => null)
  const inApp = useSyncExternalStore(nunca, detectInApp, () => false)
  const installable = useSyncExternalStore(subscribeInstallable, canInstall, () => false)
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false)

  // Lo que decide la persona, que manda sobre lo que se ha detectado.
  const [chosen, setChosen] = useState<Platform | null>(null)
  const [used, setUsed] = useState(false)
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null)
  const [busy, setBusy] = useState(false)

  const platform = chosen ?? detected
  const installed = standalone || outcome === 'accepted'
  const showButton = installable && !used && !inApp

  async function install() {
    const prompt = window.__pwaPrompt
    if (!prompt) return

    setBusy(true)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setOutcome(choice.outcome)
      // El aviso del navegador solo se puede usar una vez.
      window.__pwaPrompt = undefined
      setUsed(true)
    } finally {
      setBusy(false)
    }
  }

  // Hasta que no hay navegador no se sabe qué enseñar. Un hueco de la altura
  // aproximada evita que la página dé un salto al resolverse.
  if (!platform) return <div className="min-h-[20rem]" aria-hidden />

  if (installed) {
    return (
      <div className="rounded-[22px] bg-raised p-5 shadow-card-soft">
        <p className="eyebrow mb-2">Ya está</p>
        <p className="display text-lead">La tienes instalada</p>
        <p className="mt-2 text-small leading-[1.5] text-ink-soft">
          Búscala en tu pantalla de inicio y ábrela desde ahí: se abre a pantalla
          completa, sin la barra del navegador.
        </p>
      </div>
    )
  }

  const guide = GUIDES[platform]

  return (
    <div>
      {/*
        Dentro del navegador de Instagram o TikTok no se puede instalar nada, y
        ninguna instrucción va a arreglarlo. Va lo primero y sin rodeos, porque
        es exactamente por donde llega la gente que ve un anuncio.
      */}
      {inApp ? (
        <div className="mb-5">
          <Notice tone="error">
            Estás viendo esto dentro de otra aplicación, y desde aquí no se puede
            instalar. Abre el menú (···) y toca «Abrir en el navegador». Luego vuelve.
          </Notice>
        </div>
      ) : null}

      {/* --- El camino bueno: un botón ----------------------------------- */}
      {showButton ? (
        <div className="mb-7">
          <Button size="lg" fullWidth disabled={busy} onClick={install}>
            {busy ? 'Instalando…' : 'Instalar en este dispositivo'}
          </Button>
          <p className="mt-2.5 text-center text-micro text-ink-faint">
            No descarga nada de ninguna tienda. Es esta misma web, con su icono.
          </p>
        </div>
      ) : null}

      {outcome === 'dismissed' ? (
        <div className="mb-5">
          <Notice>
            Sin problema. Si cambias de idea, abajo están los pasos para hacerlo a mano.
          </Notice>
        </div>
      ) : null}

      {/* --- El camino a mano --------------------------------------------- */}
      <section>
        <p className="eyebrow mb-3">{showButton ? 'O a mano' : 'Cómo se hace'}</p>

        <div className="mb-5 flex flex-wrap gap-[6px]">
          {(Object.keys(GUIDES) as Platform[]).map((key) => (
            <Chip key={key} selected={platform === key} onClick={() => setChosen(key)}>
              {GUIDES[key].label}
            </Chip>
          ))}
        </div>

        <ol className="space-y-3.5">
          {guide.steps.map((step, index) => (
            <li key={step} className="flex gap-3.5">
              <span className="folio mt-[3px] shrink-0 tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-small leading-[1.5] text-ink">{step}</span>
            </li>
          ))}
        </ol>

        {guide.note ? (
          <p className="mt-5 border-l-2 border-line pl-3.5 text-small leading-[1.5] text-ink-soft">
            {guide.note}
          </p>
        ) : null}
      </section>
    </div>
  )
}
