# Despliegue

## Vercel

1. Sube el proyecto a un repositorio de GitHub.
2. En Vercel: **Add New → Project** e importa el repositorio.
3. Framework: Next.js (se detecta solo). No hay que tocar los comandos: Vercel usa
   el script `build` del `package.json`, que ya lleva `--webpack`.
4. **Environment Variables**: copia las de `.env.local`. Ver
   [ENVIRONMENT.md](ENVIRONMENT.md).
5. Deploy.

### Por qué `--webpack` en el build

Next 16 usa Turbopack por defecto, pero Serwist necesita webpack para empaquetar
el service worker. El script ya lo resuelve; no hay que configurar nada en Vercel.

### Timeouts

El análisis de fotos del onboarding tarda entre 20 y 40 segundos. La arquitectura
ya lo contempla: la subida no espera a la IA, se encola en `outfit_photos` con
estado `pending` y la interfaz consulta el progreso.

Aun así, la función que ejecuta el análisis debe declarar su duración máxima:

```ts
export const maxDuration = 60   // en la route handler del análisis (Fase 2)
```

El plan gratuito de Vercel es más restrictivo que el de pago. Si el análisis se
corta, la fila queda en `failed` con su mensaje y el usuario puede reintentar: no
se pierde la foto ni se cobra dos veces.

---

## Supabase en producción

- Ejecuta las migraciones de `supabase/migrations/` **en orden** en el proyecto de
  producción.
- Comprueba que RLS está activo en las trece tablas (Table Editor → cada tabla
  debe mostrar el candado).
- Comprueba que los cuatro buckets son **privados**.
- **Authentication → URL Configuration**: añade el dominio de Vercel a las
  *Redirect URLs*, o el enlace de confirmación por correo no funcionará.

> Conviene un proyecto de Supabase distinto para producción y para pruebas. Los
> despliegues *preview* de Vercel apuntando a la base de datos real son una forma
> fácil de mezclar datos de prueba con datos de usuarios.

---

## Antes de pasar a `AI_MODE=production`

Lista corta, pero importante:

1. **Verificar los precios** de `lib/ai/pricing.ts` contra la documentación
   oficial. Los valores actuales están sin contrastar.
2. Definir `GEMINI_API_KEY` (y `OPENAI_API_KEY` si se usa fallback).
3. Restringir la clave de Gemini en la consola de Google a lo estrictamente
   necesario.
4. Probar una vez el onboarding completo y mirar la fila que aparece en
   `ai_usage`: tokens, coste y latencia reales.
5. Solo entonces cambiar `AI_MODE`.

---

## Comprobación posterior al despliegue

- [ ] `/register` crea cuenta y el trigger rellena `profiles`, `subscriptions`,
      `style_profile` y `user_preferences`
- [ ] El correo de confirmación redirige bien a `/auth/callback`
- [ ] Una ruta privada sin sesión redirige a `/login`
- [ ] La PWA se instala en Android (Chrome) y en iOS (Compartir → Añadir a
      pantalla de inicio)
- [ ] En modo avión aparece `/offline` y no el error del navegador
- [ ] Con dos cuentas distintas, ninguna ve los datos ni las fotos de la otra
