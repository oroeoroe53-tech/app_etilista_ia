import { BottomNav } from '@/components/nav/BottomNav'

/**
 * Toda la aplicación autenticada es dinámica: cada pantalla lee la sesión y los
 * datos del usuario, así que no hay nada que prerenderizar en el build.
 *
 * Declararlo aquí, en el layout, lo aplica a todas las rutas hijas y evita que
 * el build intente generar estáticamente páginas que dependen de una cookie.
 */
export const dynamic = 'force-dynamic'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <BottomNav />
    </>
  )
}
