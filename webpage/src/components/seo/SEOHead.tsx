import * as React from 'react'
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from '@/lib/seo'

export interface SEOHeadProps {
  title: string
  description: string
  /** Ruta relativa (ej. "/precios") usada para construir la canonical y og:url. */
  path: string
  /** Imagen OG absoluta; por defecto /og-image.png. */
  image?: string
  /** JSON-LD (schema.org) de esta página, si aplica. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  /** Directiva robots de la página; por defecto "index, follow". */
  robots?: string
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Actualiza title, meta description, canonical, Open Graph, Twitter Card y
 * JSON-LD por ruta. Sitio 100% CSR (sin SSR): estos cambios los ve Google al
 * renderizar la página, pero NO los bots de vista previa de redes sociales
 * (Facebook/WhatsApp/Twitter no ejecutan JS) — para esos, index.html ya trae
 * el mejor set de tags por defecto.
 */
export function SEOHead({ title, description, path, image, jsonLd, robots }: SEOHeadProps) {
  React.useEffect(() => {
    const url = `${SITE_URL}${path}`
    const ogImage = image ?? DEFAULT_OG_IMAGE

    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', robots ?? 'index, follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', ogImage)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', ogImage)

    const scriptId = 'seo-json-ld'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script')
        script.id = scriptId
        script.type = 'application/ld+json'
        document.head.appendChild(script)
      }
      script.textContent = JSON.stringify(jsonLd)
    } else if (script) {
      script.remove()
    }
  }, [title, description, path, image, jsonLd, robots])

  return null
}
