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

**Demostración pública** (`/demo`, `lib/demo/wardrobe.ts`)

Nadie se registra para ver funcionar algo que no ha visto funcionar. Tres
pantallas sin cuenta —portada, armario y tres opciones— con diecisiete prendas
de ejemplo que pasan por **el motor de verdad**, no por capturas. Un test
(`tests/demo.test.ts`) comprueba mes a mes que sigue componiendo tres looks:
la primera versión del armario solo daba uno en julio.

**Recuperar la contraseña** (`/recuperar`)

No existía. Olvidarla significaba perder el armario, las fotos y el perfil sin
más salida que escribir a alguien. La respuesta es la misma exista el correo o
no, para no convertir el formulario en un buscador de cuentas.

⚠️ **Requiere configuración en Supabase**: añadir `<dominio>/auth/callback` a
la lista de *Redirect URLs* (Authentication → URL Configuration). Sin eso el
enlace del correo no valida.

**Medición del embudo** (`0006_funnel.sql`, `lib/observability/funnel.ts`)

Siete momentos contados: demo, instalación, registro, fotos, análisis, primera
propuesta y "ha abierto la aplicación hoy". Sin terceros, sin cookies y por
tanto sin banner de consentimiento. Se escribe con `after()`, así que no hace
esperar a nadie, y nunca lanza.

Para mirarlo, en el editor SQL de Supabase:
`select * from funnel_summary;` y `select * from funnel_retention;`

**Las fotos originales se borran** (`0007_photo_retention.sql`, `lib/onboarding/retention.ts`)

Al cerrar el onboarding se borran de Storage los originales ya analizados. Se
conserva la fila —que hubo análisis, cuándo y qué se dedujo— pero no la imagen.
Menos exposición, menos RGPD que justificar, menos factura. Y una frase que se
puede decir en el anuncio, que está escrita en `/privacidad` y en la pantalla
donde se piden las fotos.

La limpieza busca **todo lo pendiente**, no solo lo de la sesión: quien ya tenía
fotos viejas las pierde la primera vez que complete un onboarding.

**Un fallo que encontró la demostración**

`describeGarment` repetía el estampado cuando la prenda ya se llamaba así:
todos los vaqueros del mundo se llamaban "Vaqueros azul marino vaqueros". No
era de la demo, era de cualquier armario. Arreglado y con test.

**Pendiente de verificar a mano**
- Las diez pantallas se comprobaron con una ruta de preview desechable (ya
  borrada). **Con datos reales y sesión iniciada no se han visto.**
- El cobro del plan completo no existe: `UpgradeCta` lo dice al pulsarlo.

## Votación: «¿cuál me pongo?» — 21 de septiembre de 2026

La primera función social, y la primera vez que alguien ve algo de otra persona
dentro de esta aplicación.

**Cómo funciona.** `/votacion/nueva`: de dos a cuatro fotos, una cuenta atrás
(10 min, 20 min, 1 h o 3 h) y una pregunta opcional. Sale un enlace corto
—`/v/<token>`— que se manda al grupo con el botón «Mandar al grupo»
(`navigator.share`, y copia al portapapeles cuando no existe).

**Ver es libre; votar exige cuenta.** Decisión del usuario y es la que sostiene
el boca a boca: cada votación mete la aplicación en un grupo entero. Quien abre
el enlace ve las fotos, la pregunta y el tiempo que queda; al tocar una foto se
le pide cuenta y al terminar vuelve a la votación (`?next=`, validado por
`safeNext()` para que no sirva de trampolín a dominios ajenos).

**Quien no ha votado no ve los resultados.** Enseñarle lo que van ganando las
demás antes de que opine es decirle lo que tiene que opinar. El dueño sí los ve
desde el principio: para eso preguntó. Un empate no tiene ganadora, se dice que
están empatadas.

**Seguridad: el token es la llave y la cerradura está en el servidor.**
`polls` y `poll_options` NO tienen política de lectura para terceros. Quien no
es el dueño pasa por `lib/polls/queries.ts`, que valida forma del token,
existencia y caducidad antes de usar el service role. `poll_votes` está
revocada a `anon` y `authenticated`: los votos solo se escriben desde la acción,
que comprueba que la votación sigue abierta, que la opción es de esa votación y
que quien vota no es quien pregunta. Las rutas de foto que llegan del navegador
se rechazan si no empiezan por la carpeta de quien pregunta.

**Las fotos caducan de verdad.** Bucket propio (`poll-photos`), y a las 24 h se
borran archivo y fila (`lib/polls/purge.ts`, que se ejecuta en `after()` al
crear una votación: sin cron). `/privacidad` lo explica y ya no dice que las
fotos no las ve nadie más, porque dejaría de ser verdad.

**Tres eventos nuevos en el embudo**: `poll_created`, `poll_opened`,
`poll_voted`. El último es el más valioso que tiene la aplicación: alguien que
se registró porque una amiga le pidió opinión.

⚠️ **Requiere ejecutar `0008_votacion.sql` en Supabase.** Hasta entonces no
existen ni las tablas ni el bucket, y la función falla entera.

**Sin probar de punta a punta**: hace falta la migración y dos sesiones
distintas (quien pregunta y quien vota). Tipos, lint, 298 tests y build, sí.

## El círculo — 21 de septiembre de 2026

La base de las tres funciones sociales que faltan (préstamos, eventos y
estilista de confianza). `0009_circulo.sql`.

**La decisión que lo ordena todo: estar en el círculo NO abre el armario.**
Son dos tablas y dos gestos distintos: `connections` es la relación,
`wardrobe_grants` es el permiso. Si aceptar una invitación abriera el armario,
la decisión de enseñar toda tu ropa se tomaría con prisa, en el mismo gesto, y
nadie recordaría haberla tomado.

**Se entra solo por invitación.** Enlace `/c/<token>`, de un solo uso y con una
semana de vida; máximo veinte abiertas a la vez. **No hay buscador de
usuarios**: sin él, nadie puede aparecer en la pantalla de otro sin que le
hayan dado un enlace, y esta aplicación no se convierte en un directorio de
gente con fotos de su ropa.

**Tres niveles, un solo dial** (`Nada` / `Ve mi ropa` / `Y me viste`). Con dos
interruptores sueltos existiría «puede montarme looks pero no ver mi ropa», que
no significa nada. La pantalla dice además qué te deja ver ella a ti: la
relación no es simétrica y disimularlo sería mentir.

**`can_view_wardrobe(dueño, mirón)`** es la pregunta que harán todas las
funciones siguientes, en una sola función `security definer` con `search_path`
fijado. Repetida a mano en cinco políticas, bastaría olvidar una.

Salir del círculo borra la relación **y los permisos en los dos sentidos**, y no
avisa a nadie: una notificación de «te han quitado» es una crueldad
automatizada que no arregla nada.

`/privacidad` gana un bloque y corrige la frase que decía que nadie puede ver tu
armario.

⚠️ **Requiere ejecutar `0009_circulo.sql` en Supabase.**

**Sin probar de punta a punta**: hacen falta dos cuentas. Tipos, lint, 301 tests
y build, sí.

## Armarios compartidos y préstamos — 21 de septiembre de 2026

`0010_prestamos.sql`, `lib/wardrobe/shared.ts`, `lib/loans/`, `/prestamos`,
`/armario/de/[ownerId]`.

**La decisión más importante es lo que NO se hizo.** Lo natural era abrir
`clothing_items` con una política `can_view_wardrobe(user_id, auth.uid())`. Eso
habría roto la aplicación en silencio: **ninguna** consulta del armario filtra
por `user_id` —todas se apoyan en que RLS devuelve solo lo propio— así que la
ropa de las amigas habría aparecido en el armario propio, en el motor que
compone los looks, en el perfil de estilo y en la maleta, sin un solo error
visible. El armario ajeno se lee desde el servidor filtrando por dueño a mano.
`tests/architecture.test.ts` prohíbe ahora esa política para que la decisión no
se deshaga por descuido dentro de seis meses.

**Préstamos**: pedir (con recado, que es lo que hace que te contesten),
aceptar, rechazar, cancelar y devolver. Un índice único deja un solo préstamo
vivo por prenda. Al aceptar, la prenda deja de estar disponible —no puedes
ponerte lo que está en casa de otra— y al devolverla vuelve **al estado que
tenía**, no a «disponible»: `was_available` existe para que devolver una prenda
no la saque del trastero.

**Cualquiera de las dos partes puede dar por devuelta** una prenda. Obligar a
que sea el dueño dejaría préstamos abiertos para siempre el día que alguien deje
de entrar.

**Perfil enseña cuántas peticiones esperan respuesta.** La aplicación no manda
correos ni notificaciones, así que ese número es el único sitio donde alguien se
entera de que le han pedido algo.

⚠️ **Requiere ejecutar `0010_prestamos.sql` en Supabase.**

**Sin probar de punta a punta**: hacen falta dos cuentas con permiso mutuo.
Tipos, lint, 302 tests y build, sí.

## Eventos: no ir iguales — 21 de septiembre de 2026

`0011_eventos.sql`, `lib/events/`, `/eventos`, `/e/[token]`.

**Aquí sí se usa RLS para que unas vean cosas de otras** (`is_event_guest()`),
y se puede sin miedo porque las tablas son nuevas: no hay ninguna consulta
escrita antes que dé por hecho que solo devuelven lo propio. Esa es justo la
diferencia con `clothing_items`.

**El aviso de coincidencias es la función entera.** Poner cuatro fotos en una
rejilla lo hace ya WhatsApp; decir «Marta y tú vais de verde» no. Por eso cada
invitada elige un color de la taxonomía del armario: es el único dato que la
aplicación entiende. El negro y el multicolor **no cuentan** —en una boda va de
negro media lista y avisar ahí quema el aviso— y quien no ha dicho nada no se
adivina. `tests/events.test.ts`.

**Tres formas de decir de qué vas, ninguna obligatoria**: color, frase o foto.
Exigir la foto dejaría media lista vacía, y una lista a medias no evita que
nadie repita vestido.

**El enlace del evento NO es de un solo uso**, al revés que el del círculo: se
manda al grupo entero de la boda. Puede serlo porque apuntarse no abre el
armario de nadie.

**Todo caduca**: una semana después del día señalado se borra el evento con sus
fotos. Y al cancelar un evento las fotos se borran **antes** que la fila,
porque el borrado en cascada se lleva las rutas y sin ellas los archivos
quedarían en Storage para siempre.

⚠️ **Requiere ejecutar `0011_eventos.sql` en Supabase.**

Tipos, lint, 311 tests y build, sí. De punta a punta, con dos cuentas, no.

## Estilista de confianza — 21 de septiembre de 2026

`0012_estilista.sql`, `lib/styled/`, `/vestir`, `/vestir/[ownerId]`.

La cuarta y la más barata: el nivel `style` de `wardrobe_grants` existía desde
`0009_circulo.sql`, se guardaba y se leía. Solo faltaba dónde poner lo que
monta y `can_style_wardrobe()`, hermana de `can_view_wardrobe()` — dos
funciones y no una con parámetro, porque ver la ropa y decidir cómo se combina
no son lo mismo, y esa diferencia es justo lo que el dial le pregunta a la
gente.

**Sin puntuación ni porcentaje.** Quien monta esto es una persona que conoce a
la otra; ponerle un 72 % de acierto a su elección sería ponerle nota a un
regalo. La pantalla solo impide lo imposible: lo que está prestado ahora mismo
no se puede elegir.

**Lo que se comprueba en el servidor es que TODAS las prendas son de quien va a
llevarlas.** Sin eso se podría mandar un look con ropa de una tercera persona y
quien lo recibe vería fotos de un armario que no conoce.

**Marcar como visto solo puede quien lo lleva.** Ver por otra persona no es
ver, y ese dato es lo que le dice a quien lo montó si ha llegado. En la portada
aparece un aviso mientras haya alguno sin ver: es lo único de esa pantalla que
ha hecho una persona a mano, pensando en ti.

⚠️ **Requiere ejecutar `0012_estilista.sql` en Supabase.**

Con esto están las cuatro funciones sociales. Tipos, lint, 311 tests y build,
sí. De punta a punta, con dos cuentas, ninguna.

## Rediseño social, primera mitad — 21 de septiembre de 2026

Implementando `Social.dc.html` (18 pantallas, export de Claude Design que ya
conocía este repo).

**Pestaña Social** (`f42a34d`). Ocupa el sitio de Estilo, que pasa a Perfil.
Portada con racha, votaciones pendientes, rescate del día y todo lo social
reunido. La racha sale de `wear_history`, no de una tabla nueva.

**Las votaciones las monta el motor** (`0013_votacion_looks.sql`). Es la idea
del diseño y mejora lo que había: antes, para preguntar «¿cuál me pongo?» había
que ponerse las dos opciones y fotografiarlas —vestirse dos veces para decidir
cómo vestirse—. Ahora el motor compone tres looks con la ropa del armario y solo
hay que decir para qué es y cuánto tiempo queda.

 · **No gasta IA ni cupo**: el motor es cálculo puro y el porqué de cada look
   sale de `explainFromHighlights`, no de un modelo. Una votación no puede
   costar dinero cada vez que alguien tiene prisa por la mañana.
 · **Y quita el problema de las fotos**: quien vota ve tres conjuntos, no una
   foto tuya circulando por un grupo.
 · Las fotos siguen existiendo en `/votacion/fotos`, que es lo correcto cuando
   lo que dudas lo tienes en la mano: dos vestidos en el probador, o algo que el
   armario no sabe que existe. `poll_options` admite exactamente una de las dos
   cosas, por CHECK.
 · **«Me pongo este»** marca el look ganador como puesto: entra en el diario y
   cuenta para la racha. La votación deja de ser un juego aparte.

**Quién ve una votación cambió**: antes solo quien recibía el enlace, ahora
también tu círculo. Dicho en el compositor y en `/privacidad`.

⚠️ **Requiere ejecutar `0013_votacion_looks.sql` en Supabase.**

**Ficha de amiga** (`/circulo/[friendId]`) con **«Vísteme con tu armario»**: el
motor compone un look **con la ropa de ella y tu perfil de estilo**, y señala la
prenda protagonista —una que tú no tienes— con el botón de pedirla prestada. Es
la idea más fina del rediseño porque contesta a lo que de verdad lleva a alguien
al armario de una amiga: no «qué tiene», sino «qué tiene que a mí me quedaría
bien». El dial de permisos se muda de la lista a esta ficha: cinco diales
seguidos invitan a tocarlos sin mirar.

**Evento**: cuando hay choque de color, además del aviso se dicen los colores
libres **que tú tienes**. El diseño decía «la IA te ha cambiado a teja» y eso
sería mentira —los looks del evento los declara cada una a mano, no hay nada que
cambiar—, así que se hace la mitad que sí es verdad y sí sirve.

**Publicar el look del día y feed del círculo** (`0014_feed.sql`). Un look por
día, publicado a mano, visible solo para el círculo. Sin «me gusta», sin
contadores, sin orden por interés y sin desconocidos: por fecha y se acaba. Lo
único accionable es pedir prestada una prenda, y solo cuando esa persona te deja
ver su armario. `in_same_circle()` completa la familia de
`can_view_wardrobe()` / `can_style_wardrobe()`; nótese el orden de los
argumentos en la política: pregunta si **quien publicó** te tiene a ti, no al
revés.

⚠️ **Requiere ejecutar `0014_feed.sql` en Supabase.**

**Pendiente del diseño**: retos semanales, resumen mensual, duelo de armarios.
Y las tres que no se pueden hacer tal cual: el espejo de las 8 (no hay
notificaciones), «recréalo con mi ropa» (visión por IA sobre foto ajena) y un
feed que solo se llena si hay gente publicando. Y tres que no se pueden hacer tal cual: el espejo de las 8
(no hay notificaciones), «recréalo con mi ropa» (necesita visión por IA sobre
foto ajena) y el feed (vacío con un círculo de dos).

---

## Registro de decisiones previas

| Fecha | Decisión |
|---|---|
| 2026-09-18 | Carpeta del proyecto: `OneDrive\Documentos\app estilista ia` |
| 2026-09-18 | Desvíos frente al prompt original, aprobados: sin tabla EAV de atributos; `usage_limits` pasa a configuración en código; `style_profile` (aprendido) separado de `user_preferences` (declarado); una sola llamada de visión para todas las fotos del onboarding |
