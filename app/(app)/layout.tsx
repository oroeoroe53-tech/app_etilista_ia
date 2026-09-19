import { BottomNav } from '@/components/nav/BottomNav'
import { ViewTransitions } from '@/components/transitions/ViewTransitions'

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
    // El proveedor va aquí, en el layout, porque sobrevive a la navegación:
    // el enlace que la inicia se desmonta y no puede enterarse de que terminó.
    <ViewTransitions>
      <main>{children}</main>
      <BottomNav />
    </ViewTransitions>
  )
}
