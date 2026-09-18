# PROGRESO

> Archivo de continuidad. Si se retoma el proyecto en una sesión nueva de Claude Code,
> **leer primero `PLAN.md` y después este archivo** para saber en qué punto está todo.

**Última actualización:** 2026-09-18

---

## Estado actual

**Fase 2 — Onboarding: COMPLETADA y verificada.**

```
npm run typecheck          ✓ sin errores
npm run test               ✓ 58 tests, 6 archivos
npm run lint               ✓ sin avisos
npm run build              ✓ 16 rutas
npm run verify:rls         ✓ 31/31 contra Supabase real
npm run verify:onboarding  ✓ 10/10 de extremo a extremo
```

El circuito completo funciona: subir fotos → análisis → deduplicación →
armario con miniaturas recortadas.

**Siguiente paso:** Fase 3 (armario editable: filtros, detalle, corrección
de atributos, alta manual).

---

## Tabla de fases

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Planificación técnica | ✅ Aprobada |
| 1 | Foundation | ✅ Completada |
| 2 | Onboarding ("Enséñame cómo vistes") | ✅ Completada |
| 3 | Armario editable | ⬜ Siguiente |
| 4 | Perfil de estilo | ⬜ No iniciada |
| 5 | Motor de outfits | ⬜ No iniciada |
| 6 | "¿Qué me pongo?" | ⬜ No iniciada |
| 7 | Swipe y feedback | ⬜ No iniciada |
| 8 | Optimización, límites y observabilidad | ⬜ No iniciada |
| 9 | Pagos (Stripe) | ⬜ Posterior al MVP |
| 10 | Virtual try-on | ⬜ Posterior al MVP |

---

## Qué existe ya (Fase 1)

**Base**
- Next.js 16.3.5 · React 19.3 · TypeScript strict · Tailwind 4.3 · Vitest 5
- PWA con Serwist: manifest, iconos generados, service worker, `/offline`
- Sistema de diseño con modo claro y oscuro, tipografía editorial
- Navegación inferior de cinco pestañas

**Supabase**
- Tres clientes separados: navegador, servidor y admin (service role)
- `proxy.ts` refresca la sesión y protege las rutas privadas
- Cuatro migraciones: 13 tablas, RLS en todas, 4 buckets privados, contador atómico
- Alta y registro por correo y contraseña, con trigger que crea las filas satélite

**IA**
- AI Router con enrutado por operación y fallback configurable
- Providers: Gemini, OpenAI y mock (datos realistas y deterministas)
- Validación Zod + reparación de JSON + reintento + registro en `ai_usage`
- Tabla de precios y funciones de consulta de coste

**Negocio**
- Planes Free/Pro centralizados en un solo archivo
- `checkEntitlement` / `consumeEntitlement` / `requireEntitlement`

**Tests (38)**
- Reparación de JSON (12 casos reales de fallo de modelo)
- Schema de visión y salida del provider simulado
- Planes, periodos y estimación de coste
- Límites de arquitectura: el motor no puede importar IA; ningún componente
  cliente puede tocar el service role ni una clave secreta

---

## Supabase: conectado y verificado (2026-09-18)

Proyecto creado, `.env.local` configurado y esquema aplicado.

`npm run verify:rls` → **31/31 comprobaciones correctas**:

- Las 13 tablas existen y responden
- Los 4 buckets existen y son privados
- El trigger de alta crea las 4 filas satélite y el plan arranca en `free`
- Un usuario no ve la ropa de otro, ni conociendo el id de la prenda
- Un usuario **no** puede ascenderse a Pro, ni escribir en `ai_usage`,
  ni tocar sus contadores de uso
- `increment_usage` acumula correctamente

El script crea dos usuarios de prueba y los borra al terminar: no deja rastro.

### Pendiente del usuario

1. **Rotar la clave `sb_secret_`**, que se compartió por chat durante la
   configuración. Al hacerlo, actualizar esa línea de `.env.local`.
2. **Excluir `node_modules` y `.next` de la sincronización de OneDrive**
   (la instalación funcionó sin problemas, pero conviene).
3. Antes de publicar: **volver a activar "Confirm email"** en Authentication.

Las claves de Gemini y OpenAI **no hacen falta todavía**: `AI_MODE=mock`.

---

## Qué existe ya (Fase 2)

**Subida**
- Selección múltiple con previsualización y borrado antes de subir
- Compresión a 1280 px en el navegador (elimina el EXIF, y con él la ubicación)
- Subida directa del navegador a Storage: el archivo no pasa por Next
- El registro sí pasa por el servidor, que valida la ruta y el cupo del plan

**Análisis**
- Asíncrono: las fotos quedan en `pending`, la interfaz consulta el progreso
- Una sola llamada de visión con todas las fotos juntas
- Recorte de cada prenda con su bbox usando `sharp` → miniatura del armario
- Lectura cruda guardada en `detected_items` para poder reprocesar sin volver a
  llamar a la IA
- Si falla, las fotos quedan en `failed` con su motivo y se puede reintentar sin
  volver a subirlas

**Deduplicación**
- Similitud por atributos con pesos, colores confundibles con crédito parcial y
  categoría eliminatoria
- Tres desenlaces: fusionar, preguntar o crear prenda nueva
- Con lectura dudosa **nunca** se fusiona en silencio
- Pantalla "¿Es la misma prenda?", saltable

**Armario**
- Prendas reales agrupadas por capa, con miniaturas por URL firmada
- Aviso de las prendas que la IA no vio con claridad

## Decisiones tomadas durante la Fase 1

| Tema | Decisión |
|---|---|
| Next 16 | `middleware.ts` está deprecado; se usa `proxy.ts` |
| Turbopack vs webpack | `dev` con Turbopack, `build` con webpack (lo exige Serwist) |
| ESLint | `eslint-config-next` 16 ya es flat config; `FlatCompat` rompe |
| Fotos | Se guarda solo la versión de 1280 px, no el original de 12 MP |
| Tipos de Supabase | Se generarán con la CLI cuando el proyecto exista, no a mano |
| Borrado de cuenta | Cascada en SQL, pero Storage hay que vaciarlo desde el código (Fase 8) |

---

## Deuda técnica anotada

- `lib/ai/pricing.ts` tiene precios **sin verificar**. Contrastarlos antes de
  pasar a `AI_MODE=production`.
- Falta el borrado de archivos de Storage al eliminar una cuenta (Fase 8).
- `getUsage()` suma en memoria; con volumen habrá que pasarlo a una función SQL.
- El script de RLS no comprueba todavía el aislamiento en Storage (subir un
  archivo a la carpeta de otro usuario). Añadirlo en la Fase 2, cuando haya
  subidas reales.

---

## Registro de decisiones previas

| Fecha | Decisión |
|---|---|
| 2026-09-18 | Carpeta del proyecto: `OneDrive\Documentos\app estilista ia` |
| 2026-09-18 | Desvíos frente al prompt original, aprobados: sin tabla EAV de atributos; `usage_limits` pasa a configuración en código; `style_profile` (aprendido) separado de `user_preferences` (declarado); una sola llamada de visión para todas las fotos del onboarding |
