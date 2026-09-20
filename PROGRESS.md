# PROGRESO

> Archivo de continuidad. Si se retoma el proyecto en una sesión nueva de Claude Code,
> **leer primero `PLAN.md` y después este archivo** para saber en qué punto está todo.

**Última actualización:** 2026-09-19

---

## Estado actual

**Fase 8 — Límites y observabilidad: COMPLETADA y verificada.**

```
npm run typecheck           ✓ sin errores
npm run test                ✓ 215 tests, 13 archivos
npm run lint                ✓ sin avisos
npm run build               ✓ 23 rutas
npm run verify:rls          ✓ 37/37 contra Supabase real
npm run verify:integration  ✓ 43/43 de extremo a extremo
```

**EL MVP ESTÁ COMPLETO.** Fases 0 a 8 terminadas. Lo que queda (Stripe y
virtual try-on) el plan lo sitúa fuera del MVP.

### ⚠️ Pendiente antes de nada

**Aplicar `supabase/migrations/0005_usage_and_limits.sql`** en el editor SQL de
Supabase. Sin ella, la consulta de consumo agregado devuelve ceros (no rompe
nada, pero no informa).

### Sin comprobar visualmente

El swipe está detrás del login y no introduzco contraseñas en formularios, así
que los gestos táctiles, la hoja de motivos y las animaciones **no se han
probado a mano**. La lógica sí está cubierta por tests.

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
| 7 | Swipe y feedback | ✅ Completada |
| 8 | Optimización, límites y observabilidad | ✅ Completada |
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

## Qué existe ya (Fase 7)

**Baraja**
- Se generan 40 candidatos y se descartan los ya valorados, comparando por una
  firma independiente del orden de las prendas. Sin eso, el motor determinista
  enseñaría la misma baraja cada sesión.
- Los looks **no se guardan al generar la baraja**, solo cuando alguien reacciona
  a uno. Escribir doce filas por cada baraja abandonada es basura en la base de datos.
- Si ya se valoró todo, se repiten los mejores y se avisa, en vez de enseñar una
  pantalla vacía.

**Gestos**
- Arrastrar con el dedo (izquierda, derecha, arriba), botones y flechas del
  teclado: las tres vías hacen lo mismo
- Sellos de "Me gusta" / "No" / "Me encanta" mientras se arrastra
- Carta siguiente visible detrás

**Motivo del rechazo**
- Se pregunta, pero el rechazo **ya está registrado** antes de abrir la hoja: se
  puede saltar sin perder la señal
- El motivo decide a qué dimensión va el castigo (§17)

**Aprendizaje**
- El perfil se recalcula cada cinco valoraciones y al terminar la baraja
- "No sé" cuenta como señal vista y vale exactamente cero
- Todo aritmética: un test de integración comprueba que el bucle entero no gasta
  ni una llamada de IA

## Qué existe ya (Fase 8)

**Control de ráfagas** (`lib/security/rate-limit.ts`)
- Responde a una pregunta distinta de la del plan: no "cuánto al mes" sino
  "cuántas veces por minuto". Hacen falta las dos.
- Cubos por ventana sobre `usage_counters`, con la misma función atómica que ya
  existía. Un contador en memoria sería inútil: cada petición puede caer en una
  instancia distinta.
- Si el limitador falla, **deja pasar**. Los límites del plan siguen debajo, así
  que el gasto sigue teniendo techo.

**Borrado de cuenta** (`lib/account/delete.ts`)
- La cascada de Postgres limpia las tablas pero **no toca Storage**. Sin esto,
  las fotos de quien pidió irse se quedaban en el servidor.
- Primero los archivos, después el usuario: al revés, un fallo a mitad dejaría
  archivos sin dueño conocido.
- Si los archivos no se pueden borrar, **no se borra la cuenta**: mejor un error
  honesto que decir "hecho" dejando las fotos.
- Pide escribir el correo a mano.

**Observabilidad** (`lib/observability/log.ts`)
- JSON de una línea, que es lo que sabe agrupar el visor de Vercel
- Lista de campos prohibidos: correos, claves, rutas de fotos, respuestas de
  modelos. Nueve tests lo comprueban.
- De un error se registra el mensaje, nunca la traza: una traza arrastra valores
  de variables, y entre ellos hay claves.

**Consumo**
- La suma la hace Postgres (`ai_usage_summary`), no el proceso
- El perfil enseña el consumo real de cada límite con su barra

**Deuda saldada**
- Aislamiento de Storage probado: seis comprobaciones nuevas en `verify:rls`
- `getUsage()` ya no suma en memoria
- Borrado de Storage al eliminar la cuenta

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
- **`lib/ai/pricing.ts` sigue con precios SIN VERIFICAR.** Contrastarlos con la
  documentación de Google y OpenAI antes de pasar a `AI_MODE=production`.
- `purge_rate_buckets()` existe pero no hay nada que la llame: conviene un cron
  diario en Supabase, o la tabla `usage_counters` irá creciendo.
- Los gestos del swipe no se han probado a mano (están detrás del login).

---

## Rediseño "pep" (handoff de Claude Design) — 2026-09-20

Se implementó el paquete `design_handoff_pep_app`: 10 pantallas, sistema visual
editorial (crema + negro cálido + Instrument Serif) y las interacciones que
describe. **La maleta queda fuera por decisión del propio handoff.**

**Sistema visual** (`app/globals.css`)
- Los tokens son los del handoff, no una aproximación: `#f4f1ea` de fondo,
  `#fffdf8` de tarjeta, `#15140f` de tinta, arcilla `#8a6a4f` para lo único que
  lleva color.
- `.on-dark` redefine las mismas variables en un subárbol. Es lo que permite que
  "Descubre" sea negra **sin una sola variante de componente**.
- `.photo-slot` es la textura diagonal del handoff. Un hueco sin foto deja de
  parecer un error.
- Volanta y contadores en monoespaciada de 9,5 px, según la escala del handoff.

**Se quitó el modo oscuro automático.** La identidad es el crema, y "Descubre"
es la excepción. Si el teléfono pudiera invertir la aplicación entera, esa
excepción dejaría de significar nada. Afecta a `themeColor`, al manifiesto y a
los iconos, que se regeneraron.

**Piezas nuevas que el diseño necesitaba y no existían**
- `lib/outfits/daily.ts` — el look de la portada. **No gasta cupo ni llama a
  ningún modelo**: se compone con el motor una vez al día y se guarda. Abrir la
  aplicación diez veces no puede consumir las diez propuestas del plan.
- `lib/outfits/name.ts` — titular determinista de un look ("Neutros y una
  chaqueta"), calculado desde la paleta y las capas. Se guarda en `context.title`
  al persistir, para que el mismo look no se llame de dos maneras.
- `lib/wardrobe/pairs.ts` — "combina bien con" de la ficha de prenda. Comparación
  por parejas, no el motor en pequeño: es otra pregunta y cuesta mil veces menos.
- `Gap.coverage` — las barras de "lo que te falta" son un número **contado**
  (tres prendas de las cuatro que harían falta), no una estimación.
- `StylePortrait.headlineSecond` — la segunda línea en cursiva del titular.

**Lo que NO se implementó del handoff, y por qué**
| Elemento | Motivo |
|---|---|
| Nombre "pep" | La aplicación se llama Estilista en manifiesto, splash, metadatos y correos. Renombrar el producto no es una decisión de maquetación. |
| "Cambiar pieza" en Tres opciones | No existe la función de sustituir una prenda de un look ya propuesto. En su lugar va "Otra idea". |
| "14 looks posibles con ella" | Exigiría montar todas las combinaciones al abrir cada prenda, y contaría conjuntos, no conjuntos buenos. |
| "Notificación diaria → 8:00" | No hay notificaciones. |
| Tercera tira de filtros del armario | El diseño maqueta dos; se mantiene la de temporada y "guardadas" porque es la única puerta a las prendas archivadas. |

**El diario y la maleta.** El handoff no les da sitio. En la primera versión
quedaron colgando solo de la pantalla de Outfits, que en la práctica es lo mismo
que haberlos quitado: lo que no se ve al abrir, no existe. Van en dos filas finas
al pie de la portada, después de lo que sí responde a la pregunta del día. Y
"Guardado en tu diario" es ahora un enlace al diario — decirlo sin dejar llegar
era contar dónde está algo y no abrir la puerta.

**La pantalla de arranque.** El rediseño no la tocó (`git diff` sobre
`app/splash.css` salió vacío). Después, a petición, dos cambios:

- **Se ve también en el navegador.** Antes estaba detrás de
  `display-mode: standalone`. El argumento original seguía siendo válido —la
  pestaña ya da contexto— pero pesa menos que poder verla sin instalar nada.
  Solo sale en cargas completas: navegar entre pantallas no remonta ese nodo.
- **Un ~40 % más lenta**: de 1,28 s a 1,77 s en total. La percha llegaba a la
  barra antes de que el ojo la hubiera encontrado, y un gesto que hay que
  adivinar no es un gesto.

Si la PWA ya estaba instalada, hay que cerrarla del todo para que el service
worker suelte el CSS viejo.

**Instalación como PWA** (`/instalar`, `components/pwa/InstallGuide.tsx`)

Pública a propósito: se llega desde un anuncio, antes de tener cuenta. No está
en la barra de navegación —se hace una vez y no se vuelve— sino enlazada desde
entrar, crear cuenta y Perfil.

- Donde el navegador avisa con `beforeinstallprompt` (Chrome, Edge) sale un
  **botón** y nadie lee instrucciones. El evento llega antes de que React se
  hidrate, así que se captura con un script en línea en el layout y se guarda.
- Safari no tiene esa API, así que en iPhone van los pasos a mano. El
  dispositivo se detecta y se puede cambiar con los chips.
- **Detecta el navegador dentro de otra aplicación** (Instagram, TikTok…) y lo
  dice lo primero: desde ahí no se puede instalar, y ninguna instrucción lo
  arregla. Es justo por donde llega quien ve un anuncio.
- Lo que se lee del navegador va con `useSyncExternalStore`, no con un efecto:
  son estados externos que pueden cambiar solos.

**Pendiente de verificar a mano**
- Las diez pantallas se comprobaron con una ruta de preview desechable (ya
  borrada). **Con datos reales y sesión iniciada no se han visto.**
- El cobro del plan completo no existe: `UpgradeCta` lo dice al pulsarlo.

---

## Registro de decisiones previas

| Fecha | Decisión |
|---|---|
| 2026-09-18 | Carpeta del proyecto: `OneDrive\Documentos\app estilista ia` |
| 2026-09-18 | Desvíos frente al prompt original, aprobados: sin tabla EAV de atributos; `usage_limits` pasa a configuración en código; `style_profile` (aprendido) separado de `user_preferences` (declarado); una sola llamada de visión para todas las fotos del onboarding |
