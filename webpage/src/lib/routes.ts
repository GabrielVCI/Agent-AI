import { industryPages } from '@/data/industries'

/**
 * Fuente única de rutas públicas indexables. La usan tanto
 * scripts/generate-sitemap.ts (sitemap.xml) como scripts/prerender.ts
 * (HTML estático por ruta) para evitar mantener la lista dos veces.
 *
 * No incluye: /demo/smokey-cursor (interno, no enlazado), rutas con
 * parámetros de query (?motivo=demo), ni la ruta comodín 404.
 */
export interface PublicRoute {
  path: string
  changefreq: 'weekly' | 'monthly' | 'yearly'
  priority: number
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/como-funciona', changefreq: 'monthly', priority: 0.8 },
  { path: '/integraciones', changefreq: 'monthly', priority: 0.8 },
  { path: '/precios', changefreq: 'monthly', priority: 0.9 },
  { path: '/industrias', changefreq: 'monthly', priority: 0.8 },
  { path: '/contacto', changefreq: 'monthly', priority: 0.9 },
  { path: '/terminos', changefreq: 'yearly', priority: 0.3 },
  { path: '/privacidad', changefreq: 'yearly', priority: 0.3 },
  ...industryPages.map((industry) => ({
    path: `/industrias/${industry.slug}`,
    changefreq: 'monthly' as const,
    priority: 0.7,
  })),
]
