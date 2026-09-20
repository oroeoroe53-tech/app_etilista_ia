import Link from 'next/link'
import { PLAN_LIMITS } from '@/lib/subscriptions/plans'

export const metadata = {
  title: 'Qué hago con tus datos · Estilista',
  description: 'Qué se guarda, cuánto tiempo, quién lo ve y cómo borrarlo.',
}

/**
 * Privacidad.
 *
 * Pública y escrita en castellano normal. Una aplicación que pide fotos tuyas
 * vestido tiene que poder explicar en una pantalla qué hace con ellas; si hace
 * falta un abogado para entenderlo, el problema no es el texto.
 *
 * Los números salen de la configuración real (`PLAN_LIMITS`) en vez de estar
 * escritos a mano: un documento legal que contradice al código es peor que no
 * tener documento.
 */
export default function PrivacyPage() {
  return (
    <main
      className="mx-auto w-full max-w-[30rem] pt-safe pb-16"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="pt-7 pb-6">
        <p className="eyebrow mb-2.5">Sin letra pequeña</p>
        <h1 className="display text-[33px] leading-[1.05]">
          Qué hago
          <span className="display-italic block">con tus datos</span>
        </h1>
      </header>

      <Block title="Tus fotos se borran solas">
        Las fotos que subes sirven para una cosa: que la inteligencia artificial
        lea qué prendas llevas puestas. En cuanto termina y tu armario está
        montado, <strong className="font-medium text-ink">el original se borra</strong>.
        Lo que se queda es el recorte de cada prenda, que es lo único que la
        aplicación vuelve a mirar.
      </Block>

      <Block title="Qué se guarda">
        Tu correo, el nombre que hayas puesto, tu armario (el recorte y las
        características de cada prenda), los looks que te he propuesto y lo que
        has valorado. Si guardas tu ciudad, se guarda para consultar el tiempo.
      </Block>

      <Block title="Qué no se guarda">
        No hay analítica de terceros, ni cookies de publicidad, ni píxeles de
        seguimiento. No se registra tu IP, ni tu navegador, ni de dónde vienes.
        Por eso esta aplicación no te pide aceptar cookies: no hay ninguna que
        aceptar.
      </Block>

      <Block title="Quién ve tus fotos">
        Nadie más que tú. Para analizarlas se mandan al proveedor del modelo de
        visión, que las procesa y no las usa para entrenar. Ningún otro usuario
        puede ver tu armario: la base de datos lo impide a nivel de fila, no
        solo en la pantalla.
      </Block>

      <Block title="Cuánto se guarda">
        Mientras tengas cuenta. En cuanto la borras desaparece todo: fotos,
        recortes, armario, perfil de estilo e historial. No hay copia de
        cortesía ni papelera de treinta días. Puedes hacerlo tú desde Perfil,
        sin pedírselo a nadie.
      </Block>

      <Block title="Por qué hay límites">
        Analizar una foto cuesta dinero de verdad. El plan gratuito permite{' '}
        {PLAN_LIMITS.free.analyze_outfit} análisis al mes y{' '}
        {PLAN_LIMITS.free.add_clothing_item} prendas en el armario, no para
        forzarte a pagar sino para que el coste no se dispare. Los contadores
        están a la vista en Perfil.
      </Block>

      <Block title="Si algo de esto cambia">
        Se avisa aquí y en la aplicación antes de que pase, no después.
      </Block>

      <div className="mt-10 border-t border-line pt-6 text-center">
        <Link href="/" className="text-[11.5px] text-ink-soft underline underline-offset-4">
          Volver
        </Link>
      </div>
    </main>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5 last:border-b">
      <h2 className="display text-[19px]">{title}</h2>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">{children}</p>
    </section>
  )
}
