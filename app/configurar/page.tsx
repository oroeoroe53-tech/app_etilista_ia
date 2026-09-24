export const metadata = { title: 'Configuración pendiente · Selyqo' }

/**
 * Pantalla que aparece cuando falta `.env.local`.
 *
 * Existe para que arrancar el proyecto por primera vez no sea una pantalla de
 * error de Next, sino una lista de lo que falta.
 */
export default function SetupPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <p className="eyebrow mb-3">Selyqo</p>
      <h1 className="display mb-4 text-4xl">Falta conectar Supabase</h1>

      <p className="mb-8 text-sm leading-relaxed text-ink-soft">
        La aplicación está montada, pero todavía no sabe a qué base de datos hablar.
      </p>

      <ol className="space-y-5 text-sm leading-relaxed text-ink-soft">
        <Step n={1}>
          Crea un proyecto gratuito en <Code>supabase.com</Code>.
        </Step>
        <Step n={2}>
          Copia <Code>.env.example</Code> a <Code>.env.local</Code>.
        </Step>
        <Step n={3}>
          Rellena <Code>NEXT_PUBLIC_SUPABASE_URL</Code>,{' '}
          <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code> y{' '}
          <Code>SUPABASE_SERVICE_ROLE_KEY</Code> desde{' '}
          <span className="text-ink">Project Settings → API</span>.
        </Step>
        <Step n={4}>
          Ejecuta los archivos de <Code>supabase/migrations/</Code> en orden, desde el
          editor SQL de Supabase.
        </Step>
        <Step n={5}>Reinicia el servidor de desarrollo.</Step>
      </ol>

      <p className="mt-10 text-xs leading-relaxed text-ink-faint">
        Mientras tanto <Code>AI_MODE=mock</Code> mantiene la IA simulada: nada de lo que
        hagas al probar consume dinero.
      </p>
    </main>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="display shrink-0 text-xl text-ink-faint">{n}</span>
      <span>{children}</span>
    </li>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.8em] text-ink">
      {children}
    </code>
  )
}
