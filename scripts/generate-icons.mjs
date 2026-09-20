import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

/**
 * Genera los iconos de la PWA a partir de un SVG.
 *
 * Se guardan en el repositorio (no se generan en cada build) porque el manifest
 * los referencia como archivos estáticos. Para cambiar la marca: editar el SVG
 * de aquí abajo y volver a ejecutar `node scripts/generate-icons.mjs`.
 */

const ICON = (size, bg, fg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${bg}"/>
  <g stroke="${fg}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M256 168a34 34 0 1 1 34-34"/>
    <path d="M256 168v44L114 312a24 24 0 0 0 14 44h256a24 24 0 0 0 14-44L256 212"/>
  </g>
</svg>`

/** El icono maskable necesita margen: Android recorta hasta un 20% del borde. */
const MASKABLE = (bg, fg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${bg}"/>
  <g transform="translate(256 256) scale(0.7) translate(-256 -256)"
     stroke="${fg}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M256 168a34 34 0 1 1 34-34"/>
    <path d="M256 168v44L114 312a24 24 0 0 0 14 44h256a24 24 0 0 0 14-44L256 212"/>
  </g>
</svg>`

const BG = '#15140f'
const FG = '#f7f4ee'

await mkdir('public/icons', { recursive: true })

const jobs = [
  ['public/icons/icon-192.png', ICON(512, BG, FG), 192],
  ['public/icons/icon-512.png', ICON(512, BG, FG), 512],
  ['public/icons/icon-maskable-512.png', MASKABLE(BG, FG), 512],
  ['public/icons/apple-touch-icon.png', ICON(512, BG, FG), 180],
  ['public/favicon.ico', ICON(512, BG, FG), 48],
]

for (const [out, svg, size] of jobs) {
  const pipeline = sharp(Buffer.from(svg)).resize(size, size)
  await (out.endsWith('.ico') ? pipeline.png().toFile(out.replace('.ico', '.png')) : pipeline.png().toFile(out))
  console.log('✓', out.endsWith('.ico') ? out.replace('.ico', '.png') : out)
}
