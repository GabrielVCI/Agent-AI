/**
 * Constantes y datos estructurados (JSON-LD) compartidos para SEO.
 * Fuente única del dominio/marca real usada por SEOHead e index.html.
 */

export const SITE_URL = 'https://sendwary.com'
export const SITE_NAME = 'Sendwary'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

export const DEFAULT_TITLE = 'Sendwary | Agentes IA para negocios'
export const DEFAULT_DESCRIPTION =
  'Automatiza la atención de tu negocio con agentes IA. Organiza conversaciones, solicitudes, cotizaciones, citas, audios, reportes e intervención humana desde una plataforma SaaS moderna.'

/**
 * Grafo JSON-LD sitewide (WebSite + Organization), también presente de forma
 * estática en index.html para que sea visible sin ejecutar JavaScript.
 * Un solo grafo con @id evita bloques WebSite/Organization contradictorios
 * entre index.html y las rutas internas.
 */
export const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
      email: 'info@sendwary.com',
    },
  ],
}

/** JSON-LD de la aplicación (solo en homepage). */
export const SOFTWARE_APPLICATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Plataforma SaaS de agentes IA para automatizar atención, solicitudes, cotizaciones, citas y seguimiento en negocios.',
  url: SITE_URL,
  image: `${SITE_URL}/logo.png`,
  offers: {
    '@type': 'Offer',
    priceCurrency: 'USD',
    price: '40',
    availability: 'https://schema.org/InStock',
  },
}

/** Construye un JSON-LD BreadcrumbList a partir de una ruta de migas de pan. */
export function buildBreadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  }
}

/** JSON-LD de planes (solo en /precios): un Offer por plan. */
export const PRICING_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Planes de Sendwary para automatizar atención, cotizaciones, citas, audios, catálogo, reportes e integraciones según las necesidades de tu negocio.',
  url: `${SITE_URL}/precios`,
  image: `${SITE_URL}/logo.png`,
  offers: [
    {
      '@type': 'Offer',
      name: 'Plan Básico',
      priceCurrency: 'USD',
      price: '40',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/precios`,
    },
    {
      '@type': 'Offer',
      name: 'Plan Pro',
      priceCurrency: 'USD',
      price: '60',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/precios`,
    },
    {
      '@type': 'Offer',
      name: 'Plan Enterprise',
      priceCurrency: 'USD',
      price: '90',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/precios`,
    },
  ],
}
