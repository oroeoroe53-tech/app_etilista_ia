# PROGRESO

> Archivo de continuidad. Si se retoma el proyecto en una sesión nueva de Claude Code,
> **leer primero `PLAN.md` y después este archivo** para saber en qué punto está todo.

**Última actualización:** 2026-09-19

---

## Estado actual

**Fase 6 — ¿Qué me pongo?: COMPLETADA y verificada.**

```
npm run typecheck           ✓ sin errores
npm run test                ✓ 196 tests, 11 archivos
npm run lint                ✓ sin avisos
npm run build               ✓ 22 rutas
npm run verify:rls          ✓ 31/31 contra Supabase real
npm run verify:integration  ✓ 26/26 de extremo a extremo
```

**El MVP ya es utilizable de principio a fin**: crear cuenta → subir fotos →
armario → perfil → pedir looks → marcarlos como puestos.

**Siguiente paso:** Fase 7 (swipe y feedback, que cierra el bucle de aprendizaje).

---

## Tabla de fases

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Planificación técnica | ✅ Aprobada |
| 1 | Foundation | ✅ Completada |
| 2 | Onboarding ("Enséñame cómo vistes") | ✅ Completada |
| 3 | Armario editable | ✅ Completada |
| 4 | Perfil de estilo | ✅ Completada |
| 5 | Motor de outfits | ✅ Completada |
| 6 | "¿Qué me pongo?" | ✅ Completada |
| 7 | Swipe y feedback | ⬜ Siguiente |
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

## Qué existe ya (Fase 3)

**Armario**
- Filtros por tipo, color, temporada y disponibilidad, **en la URL**: se comparte,
  el botón de atrás funciona y se renderiza en servidor
- Solo se ofrecen filtros que existen de verdad en ese armario
- Las prendas guardadas no estorban en la vista general

**Ficha de prenda**
- Todos los atributos en lenguaje humano, no en claves internas
- Aviso cuando la IA no la vio con claridad
- "Guardar por ahora" para lo que está en la lavadora o prestado
- Borrado en dos pasos, nombrando la prenda; lógico en base de datos, la foto sí se elimina

**Edición**
- Formulario completo con toda la taxonomía
- Funciona sin JavaScript: `select`, `input` y `checkbox` nativos
- Guardar marca la prenda como verificada por el usuario

**Alta manual**
- Foto opcional, y el análisis por IA es un atajo, no un peaje
- Si el análisis falla no se descuenta cupo y el formulario sigue utilizable
- Avisa cuando quedan pocas prendas de plan y bloquea al llegar al límite

**Idioma**
- Las etiquetas concuerdan en género y número: "Jersey negro", "Zapatillas
  blancas", "Vaqueros azul marino". Antes salía "Jersey negra".

## Qué existe ya (Fase 4)

**Modelo**
- En la base de datos se guardan **puntos de evidencia en bruto**, no afinidades
  de 0 a 1. Un 0 normalizado no distingue "no sé nada de este color" de "lo
  rechaza siempre", y esa diferencia importa para el motor.
- La afinidad se calcula al leer, con saturación: las primeras señales mueven
  mucho el perfil y las siguientes cada vez menos. Acotada, así que ninguna
  racha puede dominar.
- El perfil se **recalcula entero** en vez de ir sumando cambios: cuesta
  milisegundos y no puede desviarse. Cambiar un peso de `weights.ts` lo aplica
  a toda la historia en el siguiente recálculo.

**Señales**
- Tener una prenda · salir en las fotos · ponérsela · gustar · encantar · rechazar
- El motivo del rechazo decide a qué dimensión va el castigo: decir "no me gusta
  el color" no ensucia lo que se sabe del estilo ni del corte
- "Demasiado formal" mueve la formalidad preferida en vez de castigar atributos
- Los puntos se reparten entre las prendas del look: uno de cuatro piezas no
  vale cuatro veces más que uno de dos

**Pantalla**
- Retrato en castellano, sin un solo número (hay un test que lo comprueba)
- Muestras de los colores dominantes
- Admite en voz alta cuando todavía no sabe lo suficiente
- Preferencias declaradas (colores vetados, formalidad por defecto), que mandan
  sobre lo que el sistema deduzca

## Qué existe ya (Fase 5)

`lib/outfits/`, determinista y sin IA. Un test comprueba que no puede importarla.

**Flujo**
armario → filtros duros → candidatos → puntuación → diversidad → looks

**Filtros duros**
- Disponibilidad, temporada, temperatura, lluvia, formalidad, colores vetados y
  descanso de la prenda
- **Ningún filtro puede dejar un hueco vacío**: si no queda nada que ponerse, se
  relajan en orden y queda constancia de cuál cedió
- La disponibilidad no se relaja nunca: proponer algo que está en la lavadora
  destruye más confianza que no proponer

**Combinatoria**
- Topes por hueco (8 arriba y abajo, 6 calzado, 4 abrigo) → ~1.900 combinaciones
  en el peor caso, frente a las decenas de miles del enfoque ingenuo
- El tope global de seguridad no debe saltar nunca en uso normal, porque corta
  el bucle a medias; hay un test que lo vigila
- Los accesorios se eligen **después**, sobre el look ganador

**Puntuación**
- Color 30 · estilo 25 · ocasión 20 · clima 10 · gusto 10 · novedad 5
- El peso del gusto personal **se escala por la confianza del perfil**, y lo que
  se le quita va a ocasión y clima. Con cuatro señales el sistema no tiene
  derecho a opinar sobre el gusto de nadie.
- La dispersión de formalidad penaliza aparte de la media: etiqueta + estar por
  casa promedia 3 y es un despropósito

**Color**
- Neutros que combinan con todo, un protagonista, y como mucho un segundo que
  armonice. Rueda de color para distinguir análogos y complementarios del
  conflicto intermedio.

**Diversidad**
- Selección voraz con penalización por parecido: el segundo y el tercer look no
  son variaciones del primero

## Qué existe ya (Fase 6)

**Clima**
- Open-Meteo: gratis, sin clave, sin registro
- Caché de 15 minutos por zona: el tiempo no cambia en ese rato
- Si la API falla, se mete la temperatura a mano y la pantalla funciona igual
- Búsqueda de ciudad para guardar la ubicación una sola vez

**Petición**
- Ocasión, formalidad y tiempo, **todo opcional**: pulsar el botón sin decir
  nada tiene que dar algo razonable
- Límite diario del plan comprobado antes de gastar nada

**Resultado**
- Tres looks con las prendas grandes y la explicación pequeña
- "Me lo pongo" alimenta `wear_history` y los contadores de cada prenda
- Las tres propuestas comparten un `request_id` dentro de `context`: se
  recuperan juntas sin añadir una tabla que solo agruparía tres filas
- Historial de propuestas anteriores

**IA**
- **Una sola llamada** por petición, y solo para redactar las tres frases
- Se le pasan los motivos que el motor ya calculó, no el outfit a pelo: así no
  puede inventarse razones que el sistema no ha usado
- Si falla, los looks se enseñan sin frase. El motor ya había decidido.

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
