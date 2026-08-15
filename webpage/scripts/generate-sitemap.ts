// Genera public/sitemap.xml a partir de la fuente única de rutas
// (src/lib/routes.ts). Se ejecuta antes del build (ver package.json
// "prebuild") para que Vite copie el resultado a dist/ automáticamente.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES } from '../src/lib/routes.ts'
import { SITE_URL } from '../src/lib/seo.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.resolve(__dirname, '../public/sitemap.xml')

// Fecha real de generación del archivo (no fechas inventadas por URL).
const lastmod = new Date().toISOString().slice(0, 10)

const urls = PUBLIC_ROUTES.map(
  (route) => `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`,
).join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

await writeFile(outFile, xml, 'utf-8')
console.log(`✔ sitemap.xml generado con ${PUBLIC_ROUTES.length} rutas`)
