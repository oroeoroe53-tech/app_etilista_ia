# Estilista

> Enséñale cómo vistes y aprenderá a vestirte.

PWA mobile-first de estilismo personal. Aprende del armario real de cada persona,
de fotos de looks que ya lleva y de su feedback, y le propone qué ponerse según
ocasión, clima e historial.

**Estado:** Fase 1 (Foundation) terminada. Ver [PROGRESS.md](PROGRESS.md).

---

## Arrancar

```bash
npm install
cp .env.example .env.local   # y rellenar (ver abajo)
npm run dev
```

Abre <http://localhost:3000>. Si falta `.env.local`, la aplicación no se estrella:
enseña una pantalla con lo que queda por configurar.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de producción (webpack, lo necesita el service worker) |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run test` | Tests unitarios (rápidos, sin red) |
| `npm run lint` | ESLint |
| `npm run verify:rls` | Seguridad y aislamiento contra el Supabase real |
| `npm run verify:integration` | Onboarding y límites de extremo a extremo |
| `node scripts/generate-icons.mjs` | Regenera los iconos de la PWA |

Los dos `verify:` necesitan `.env.local` con credenciales de verdad. Crean
usuarios de prueba y los borran al terminar.

---

## Configurar Supabase

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. **Project Settings → API**: copia la URL, la clave `anon` y la `service_role`
   a `.env.local`.
3. **SQL Editor**: ejecuta en orden los archivos de `supabase/migrations/`:

   ```
   0001_init.sql        tablas, índices, trigger de alta de usuario
   0002_rls.sql         Row Level Security
   0003_storage.sql     buckets privados y sus políticas
   0004_functions.sql   contador de uso atómico
   ```

4. Reinicia `npm run dev`.

Detalle del modelo de datos en [docs/DATABASE.md](docs/DATABASE.md).

---

## Modo mock: desarrollar sin gastar en IA

Por defecto `AI_MODE=mock`. Los proveedores simulados devuelven datos realistas
—con prendas repetidas entre fotos y alguna dudosa— para poder construir y probar
la aplicación entera **sin llamar a ninguna API y sin gastar un céntimo**.

Para usar IA real, en `.env.local`:

```env
AI_MODE=production
GEMINI_API_KEY=...
```

Cómo funciona el enrutado, cómo cambiar de proveedor y cómo se controla el coste:
[docs/AI.md](docs/AI.md).

---

## Estructura

```
app/          rutas (App Router)
components/   interfaz
lib/
  ai/         router, providers, schemas, precios, registro de uso
  wardrobe/   taxonomía del armario
  storage/    rutas de Storage y compresión de imágenes
  subscriptions/  planes y permisos
  supabase/   clientes (navegador, servidor, admin)
supabase/migrations/   esquema SQL
tests/        lógica determinista
docs/         documentación
```

Decisiones de arquitectura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Plan completo del proyecto: [PLAN.md](PLAN.md).

---

## Nota sobre OneDrive

El proyecto vive dentro de una carpeta sincronizada con OneDrive. Conviene
**excluir `node_modules` y `.next` de la sincronización**: son decenas de miles de
archivos que OneDrive intentará subir, y el bloqueo de archivos puede provocar
errores `EPERM` al instalar o compilar.

En el icono de OneDrive → Configuración → Cuenta → Elegir carpetas, o moviendo el
proyecto fuera de OneDrive (por ejemplo a `C:\dev\`).

---

## Despliegue

[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
