// Genera el set de favicons/iconos a partir de public/logo.png.
// Uso: node scripts/generate-icons.mjs
// Vuelve a ejecutar manualmente si el logo cambia; los archivos de salida se
// commitean en public/ (sin hashes) para tener URLs permanentes.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const source = path.join(publicDir, 'logo.png')

// Fondo transparente para favicons/manifest; el apple-touch-icon usa fondo
// blanco (iOS/iPadOS no soporta transparencia real en el icono de inicio).
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/**
 * Recorta el contenido real del logo (quita márgenes transparentes) y lo
 * centra en un lienzo cuadrado del tamaño pedido, sin deformar ni recortar
 * el logo. Deja ~14% de padding para que se reconozca en tamaños pequeños.
 */
async function toSquare(size, background) {
  const trimmed = await sharp(source).trim().toBuffer()
  const inner = Math.round(size * 0.86)

  const resized = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function main() {
  const sizes = [
    { file: 'favicon-48x48.png', size: 48, background: TRANSPARENT },
    { file: 'favicon-96x96.png', size: 96, background: TRANSPARENT },
    { file: 'apple-touch-icon.png', size: 180, background: WHITE },
    { file: 'web-app-manifest-192x192.png', size: 192, background: TRANSPARENT },
    { file: 'web-app-manifest-512x512.png', size: 512, background: TRANSPARENT },
  ]

  for (const { file, size, background } of sizes) {
    const buf = await toSquare(size, background)
    await writeFile(path.join(publicDir, file), buf)
    console.log(`✔ ${file} (${size}x${size})`)
  }

  // favicon.ico multi-resolución (16/32/48) para navegadores/legacy.
  const icoSizes = [16, 32, 48]
  const icoBuffers = await Promise.all(icoSizes.map((s) => toSquare(s, TRANSPARENT)))
  const ico = await pngToIco(icoBuffers)
  await writeFile(path.join(publicDir, 'favicon.ico'), ico)
  console.log(`✔ favicon.ico (${icoSizes.join(', ')})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
