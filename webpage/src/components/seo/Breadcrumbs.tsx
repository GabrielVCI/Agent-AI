import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  name: string
  path: string
}

/**
 * Migas de pan visibles. El JSON-LD correspondiente se arma con
 * buildBreadcrumbJsonLd (lib/seo.ts) y se pasa a SEOHead — evita duplicar la
 * misma estructura en dos lugares.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="relative bg-white pt-6 dark:bg-neutral-950">
      <ol className="mx-auto flex max-w-screen-xl flex-wrap items-center gap-1.5 px-5 text-xs text-neutral-500 sm:px-6 dark:text-neutral-400">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={item.path}>
              {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <li>
                {isLast ? (
                  <span aria-current="page" className="font-medium text-neutral-700 dark:text-neutral-200">
                    {item.name}
                  </span>
                ) : (
                  <Link to={item.path} className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">
                    {item.name}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
