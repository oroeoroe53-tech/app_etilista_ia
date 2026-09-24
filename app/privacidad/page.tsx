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
        <h1 className="display text-display leading-[1.05]">
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
        Nadie más que tú, salvo que tú lo pidas. Para analizarlas se mandan al
        proveedor del modelo de visión, que las procesa y no las usa para
        entrenar. Ningún otro usuario puede ver tu armario mientras tú no se lo
        des: la base de datos lo impide a nivel de fila, no solo en la pantalla.
      </Block>

      {/*
        La votación es la única función que enseña algo tuyo a otra gente, así
        que se explica aquí con todas sus consecuencias y no en letra pequeña.
        Si algún día deja de ser verdad alguna de estas cuatro frases, se cambia
        esta página el mismo día.
      */}
      <Block title="Cuando pides opinión">
        Las fotos que subes a una votación las ven las personas de tu círculo y
        quien abra el enlace que mandes, y nadie más: el enlace lleva un
        identificador que no se puede adivinar y no aparece en buscadores ni en
        ninguna lista pública. Hace
        falta cuenta para votar, así que sabrás quién ha votado qué. La votación
        se cierra a la hora que tú digas y, pasadas veinticuatro horas, esas
        fotos se borran solas y del todo. No entran en tu armario ni se analizan
        con nada.
      </Block>

      <Block title="Tu círculo">
        Solo entra quien tú invitas, con un enlace tuyo que vale para una
        persona y caduca en una semana. No hay buscador de usuarios: nadie puede
        encontrarte por tu nombre ni por tu correo. Y estar en tu círculo no
        deja ver tu ropa: ese permiso se da persona a persona desde Perfil →
        Tu círculo, se quita igual de rápido, y quien lo pierde deja de ver tu
        armario al instante.
      </Block>

      <Block title="Cuando enseñas lo que te has puesto">
        Publicar el look del día es un gesto que haces tú, cada día, y lo ven
        solo las personas de tu círculo. No hay muro público, ni gente
        desconocida, ni forma de que alguien llegue a tus looks sin estar en tu
        círculo. No hay «me gusta» ni contadores: no se gana nada publicando
        más. Puedes quitarlo cuando quieras y desaparece sin avisar a nadie.
      </Block>

      <Block title="Duelos y retos">
        En un duelo, tu ropa no entra hasta que aceptas: si dices que no, no se
        compone nada con tu armario y no lo ve nadie. Mientras la votación es a
        ciegas, los nombres **no salen del servidor**, así que no hay forma de
        saber de quién es cada look mirando la página. Los retos no guardan
        nada de lo que haces: el progreso se calcula de tu propio historial cada
        vez que lo miras.
      </Block>

      <Block title="Ropa prestada">
        Si le pides una prenda a alguien, las dos veis ese préstamo y nadie más
        del círculo. Mientras una prenda tuya está prestada dejo de
        proponértela, porque no la tienes en casa; al volver queda como estaba.
        La ropa que ves de otra persona no entra en tu armario ni cambia lo que
        te propongo a ti.
      </Block>

      <Block title="Quien te viste">
        Si le das el permiso más alto a alguien, puede montarte looks con tu
        ropa y mandártelos. Ve tu armario y elige prendas; no puede cambiarlas,
        ni borrarlas, ni ponerse nada él. Ese look lo veis las dos y nadie más,
        y lo puedes quitar cuando quieras.
      </Block>

      <Block title="Eventos">
        Lo que subes a un evento —el color, la frase y la foto— lo ven las
        personas apuntadas a ese evento, y nadie más. El evento entero se borra
        solo una semana después del día señalado, fotos incluidas. No entra en
        tu armario ni cambia lo que te propongo.
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
        <Link href="/" className="text-small text-ink-soft underline underline-offset-4">
          Volver
        </Link>
      </div>
    </main>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5 last:border-b">
      <h2 className="display text-lead">{title}</h2>
      <p className="mt-2 text-small leading-[1.6] text-ink-soft">{children}</p>
    </section>
  )
}
