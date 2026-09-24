import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'
import { NewPasswordForm } from '@/components/auth/NewPasswordForm'
import { Button, Notice } from '@/components/ui'

export const metadata = { title: 'Contraseña nueva · Selyqo' }
export const dynamic = 'force-dynamic'

/**
 * Poner la contraseña nueva.
 *
 * Se llega desde el enlace del correo, que al pasar por `/auth/callback` deja
 * la sesión abierta. Si alguien entra aquí a pelo no hay sesión, y en vez de un
 * formulario que fallaría al enviarse se le dice qué hacer.
 */
export default async function NewPasswordPage() {
  const user = await getCurrentUser()

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center py-12"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="mb-9">
        <p className="eyebrow mb-3">Selyqo</p>
        <h1 className="display text-display leading-[1.05]">
          Elige una
          <span className="display-italic block">contraseña nueva</span>
        </h1>
      </header>

      {user ? (
        <NewPasswordForm />
      ) : (
        <div className="space-y-4">
          <Notice tone="error">
            Este enlace ya no vale. Los de recuperación caducan en una hora y solo
            se pueden usar una vez.
          </Notice>
          <Link href="/recuperar" className="block">
            <Button fullWidth>Pedir uno nuevo</Button>
          </Link>
        </div>
      )}
    </main>
  )
}
