import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

/**
 * Genera los iconos de la aplicación a partir del logotipo.
 *
 *   node scripts/build-icons.mjs
 *
 * El original es la marca blanca sobre un cuadrado gris con sus propias
 * esquinas redondeadas. Aquí no se reescala tal cual, por dos motivos.
 *
 * El color: el gris del archivo no es el negro cálido de la aplicación, y el
 * icono y la pantalla de arranque tienen que ser el mismo material. Así que se
 * recorta la marca por umbral —lo claro es marca, lo oscuro es fondo— y se
 * vuelve a componer sobre el color del tema.
 *
 * Las esquinas: cada sistema pone las suyas. iOS recorta su propio rectángulo
 * redondeado y Android, en los iconos «maskable», recorta un CÍRCULO. Con las
 * esquinas ya dibujadas en el archivo, Android las mordería por segunda vez.
 * Por eso el fondo se genera a sangre y son los sistemas los que recortan.
 *
 * Y por eso hay dos tamaños de marca: en el normal ocupa el 66%, y en el
 * «maskable» solo el 56%, porque el círculo que recorta Android se come las
 * esquinas del cuadrado y lo que quede fuera desaparece.
 */

const ORIGEN = 'design/logo.png'
const DESTINO = 'public/icons'

/** El negro cálido del tema (`--ink` en globals.css). */
const FONDO = { r: 0x15, g: 0x14, b: 0x0f, alpha: 1 }

/** La crema del tema (`--accent-ink`). */
const MARCA = { r: 0xf7, g: 0xf4, b: 0xee }

/**
 * Recorta la marca del original y la devuelve como PNG con transparencia.
 *
 * El umbral separa la marca del fondo: por encima de 140 es marca. Funciona
 * porque el original tiene un contraste enorme —blanco sobre gris muy oscuro— y
 * no hay nada a medio camino que pueda confundirse.
 */
async function extraerMarca() {
  const base = sharp(ORIGEN).flatten({ background: { r: 0, g: 0, b: 0 } })

  const alfa = await base
    .clone()
    .greyscale()
    .threshold(140)
    .toColourspace('b-w')
    .toBuffer()

  const { width, height } = await sharp(alfa).metadata()

  return sharp({
    create: { width, height, channels: 3, background: MARCA },
  })
    .joinChannel(alfa)
    .png()
    .toBuffer()
}

/** Compone la marca centrada sobre el fondo del tema, a sangre. */
async function componer(marca, lado, proporcion, salida) {
  const dentro = Math.round(lado * proporcion)

  const encajada = await sharp(marca)
    // La marca no es cuadrada: `inside` respeta su forma en lugar de estirarla.
    .resize(dentro, dentro, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  await sharp({
    create: { width: lado, height: lado, channels: 4, background: FONDO },
  })
    .composite([{ input: encajada, gravity: 'center' }])
    .png()
    .toFile(`${DESTINO}/${salida}`)

  console.log(`  ${salida}  ${lado}×${lado}  marca al ${Math.round(proporcion * 100)}%`)
}

await mkdir(DESTINO, { recursive: true })

// Se recorta antes de nada: así la marca queda ajustada a su propio contorno y
// los porcentajes de abajo significan lo mismo en todos los tamaños.
const marca = await sharp(await extraerMarca()).trim({ threshold: 1 }).png().toBuffer()

const { width, height } = await sharp(marca).metadata()
console.log(`Marca recortada: ${width}×${height}`)

await componer(marca, 192, 0.66, 'icon-192.png')
await componer(marca, 512, 0.66, 'icon-512.png')
await componer(marca, 180, 0.66, 'apple-touch-icon.png')
// Android recorta un círculo: la marca tiene que caber dentro de él.
await componer(marca, 512, 0.56, 'icon-maskable-512.png')
await componer(marca, 512, 0.7, 'favicon-source.png')

console.log('Listo.')
