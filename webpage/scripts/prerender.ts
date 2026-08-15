// Prerenderizado post-build: levanta un preview estático de dist/, visita
// cada ruta pública con Puppeteer (headless Chrome) y guarda el HTML final
// (ya con title, meta, canonical, Open Graph, JSON-LD y contenido inyectados
// por React/SEOHead) como dist/<ruta>/index.html.
//
// Esto da a los crawlers HTML completo en la respuesta inicial sin migrar a
// un framework SSR: seguimos siendo React + Vite + React Router, servidos
// como sitio 100% estático. React seguirá montándose en el cliente sobre
// este HTML (createRoot re-renderiza; no es hidratación SSR).
import { preview } from 'vite'
import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES } from '../src/lib/routes.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')

async function main() {
  const server = await preview({
    preview: { port: 4174, strictPort: true },
    build: { outDir: distDir },
  })
  const address = server.resolvedUrls?.local?.[0]
  if (!address) throw new Error('No se pudo determinar la URL del preview server.')

  const browser = await puppeteer.launch({ headless: true })

  try {
    for (const route of PUBLIC_ROUTES) {
      const page = await browser.newPage()
      await page.goto(`${address.replace(/\/$/, '')}${route.path}`, {
        waitUntil: 'networkidle0',
      })
      // SEOHead actualiza title/meta/canonical/JSON-LD en un useEffect;
      // esperar el <h1> asegura que el contenido principal ya se pintó.
      await page.waitForSelector('h1', { timeout: 10_000 }).catch(() => {})

      const html = await page.content()
      const outDir =
        route.path === '/' ? distDir : path.join(distDir, route.path.replace(/^\//, ''))
      await mkdir(outDir, { recursive: true })
      await writeFile(path.join(outDir, 'index.html'), html, 'utf-8')
      console.log(`✔ prerender ${route.path}`)

      await page.close()
    }
  } finally {
    await browser.close()
    await new Promise<void>((resolve, reject) => {
      server.httpServer.close((err) => (err ? reject(err) : resolve()))
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
