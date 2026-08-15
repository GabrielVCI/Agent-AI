# Sendwary — Sitio web

Sitio web comercial (multipágina) de **Sendwary**, plataforma SaaS de agentes IA para WhatsApp
Business. Construido con **Vite + React + TypeScript + Tailwind CSS** y **React Router**.

Es un sitio **100% estático, sin backend propio**: los formularios de `/contacto` y del modal
de lista de espera en `/precios` envían directo desde el navegador a **Web3Forms**, con
**reCAPTCHA v3**, honeypot y controles anti-spam adicionales del lado del cliente.

## Requisitos

- Node.js 18+ y npm.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5174` (puerto fijado en `vite.config.ts`).

### Probar los formularios en local

Al no haber backend propio, los formularios funcionan igual en local que en producción — solo
necesitas las variables de entorno:

```bash
cp .env.example .env      # y completa las claves reales (ver abajo)
npm run dev
```

Abre `/contacto` o haz clic en cualquier botón "Unirme a la lista - {Plan}" en `/precios` para
probar el modal de lista de espera. Ambos envían directo a Web3Forms; revisa la bandeja
configurada en tu formulario de Web3Forms para confirmar la recepción.

> **Nota sobre pruebas en `localhost`:** Web3Forms (detrás de Cloudflare) puede bloquear o
> devolver errores genéricos (p. ej. "Please use POST method to submit the form") en peticiones
> que vienen desde `localhost`, ya que su protección anti-abuso trata ese origen como sospechoso
> — no ocurre por un error en el código. La UI del formulario funciona igual en local (honeypot,
> validaciones, cooldown, reCAPTCHA), pero para confirmar que el correo realmente llega, prueba
> contra el sitio desplegado (o un Deploy Preview de Netlify), donde el `Origin` es tu dominio
> real.

## Build de producción

```bash
npm run build     # tsc -b && vite build → genera /dist
npm run preview   # sirve /dist localmente
```

## Variables de entorno

Definidas en `.env.example`. Todas son **públicas** (prefijo `VITE_`): Web3Forms usa una
Access Key pública por diseño, y la reCAPTCHA Site Key también está pensada para el frontend.
**Ningún secreto vive en este repositorio ni en variables de entorno del sitio** — ver la
sección de seguridad más abajo.

| Variable | Descripción |
| --- | --- |
| `VITE_WEB3FORMS_ACCESS_KEY` | Access Key pública del formulario en Web3Forms. |
| `VITE_WEB3FORMS_ENDPOINT` | Endpoint de envío (por defecto `https://api.web3forms.com/submit`). |
| `VITE_RECAPTCHA_SITE_KEY` | Site Key pública de reCAPTCHA v3. |

## Lista de espera (`/precios`)

La página de precios incluye una campaña de lista de espera: cada card de plan muestra el
badge **"20% OFF implementación"** y un botón **"Unirme a la lista - {Plan}"** que abre un modal
(`WaitlistModal`, en `src/components/waitlist/`) sin salir de la página ni redirigir a `/contacto`.

- **Envío:** directo a Web3Forms desde el navegador (`src/lib/web3forms.ts`), sin función
  serverless ni backend propio.
- **Planes:** `basico`, `pro`, `enterprise`.
- **Descuento:** 20% aplica **solo a la implementación** (pago único), nunca a la mensualidad;
  así queda explícito en los cards, el modal y el asunto del correo.
- **Probar en local:** ver "Probar los formularios en local" arriba.

## Protección anti-spam

Como no hay backend propio, no hay rate limiting real por IP. La protección combina varias capas
del lado del cliente, tanto en `/contacto` como en el modal de lista de espera:

- **reCAPTCHA v3** (`src/lib/recaptcha.ts`): se ejecuta por acción (`contact_form` /
  `waitlist_form`) para dar visibilidad de tráfico/bots en el panel de Google, pero **el token no
  se envía a Web3Forms**: su plan gratuito rechaza el envío completo si el campo
  `g-recaptcha-response` viene presente (`"You are trying to use a Pro feature"`). Si en el futuro
  se actualiza a Web3Forms Pro, se puede volver a incluir ese campo en el payload y configurar la
  Secret Key en su dashboard (ver sección de abajo). Si el script no carga (bloqueadores de
  anuncios, red, sin Site Key configurada), el formulario **no se bloquea** — reCAPTCHA es una
  capa adicional, no la única defensa.
- **Honeypot** (`companyWebsite`): campo oculto; si un bot lo rellena, se responde con éxito
  silencioso sin enviar nada.
- **Tiempo mínimo de llenado:** un envío en menos de 3 segundos desde que se mostró el
  formulario se trata como bot (éxito silencioso, sin bloquear con un error confuso).
- **Cooldown de sesión:** tras un envío exitoso, `sessionStorage` (no `localStorage`) bloquea un
  reenvío del mismo formulario durante 60 segundos, con el mensaje "Ya recibimos una solicitud
  recientemente. Intenta nuevamente en unos segundos."
- **Doble submit bloqueado:** el botón se deshabilita mientras el envío está en curso.
- **Validación de longitud máxima** en nombre, teléfono, email, mensaje, negocio y sistema
  actual.

> Como Web3Forms usa una access key pública, esta puede estar en el frontend. Para protección
> contra bots se usa reCAPTCHA, honeypot, validaciones, bloqueo de doble envío y cooldown en
> sesión. La protección fuerte del captcha debe completarse configurando la Secret Key en el
> dashboard de Web3Forms.

## Configurar reCAPTCHA en Web3Forms (requiere plan Pro)

Confirmado en producción: **el plan gratuito de Web3Forms rechaza el envío completo** si el
payload incluye el campo `g-recaptcha-response` (responde `"You are trying to use a Pro
feature, Please Upgrade to use reCaptcha."`). Por eso, con el plan actual, el token de reCAPTCHA
se genera en el frontend pero **no se envía a Web3Forms** — solo corre para dar visibilidad de
tráfico/bots en el panel de Google (Admin Console de reCAPTCHA).

Si en el futuro actualizas a **Web3Forms Pro**:

1. Entra al dashboard de Web3Forms.
2. Selecciona el formulario de Sendwary.
3. Ve a **Settings**.
4. Activa el proveedor de captcha como `recaptcha`.
5. Pega ahí la reCAPTCHA **Secret Key** (solo en el dashboard de Web3Forms, nunca en el código).
6. Guarda los cambios.
7. En el código, vuelve a incluir `'g-recaptcha-response': recaptchaToken ?? ''` en el payload de
   `submitToWeb3Forms(...)` en `ContactForm.tsx` y `WaitlistModal.tsx`.
8. Prueba ambos formularios (`/contacto` y el modal de lista de espera en `/precios`).

**Con el plan gratuito** (el actual), el sitio sigue funcionando de forma segura sin ese campo: el
honeypot, el tiempo mínimo de llenado, el cooldown de sesión y las validaciones ya están activos
desde el frontend sin depender del plan. También puedes considerar hCaptcha o la protección
anti-spam nativa de Web3Forms como alternativa, si tu plan la incluye.

## Deploy

El sitio es 100% estático (Vite build → `dist/`), por lo que funciona en Netlify, Vercel o
cualquier hosting estático. `netlify.toml` incluye el build command, el publish directory y el
redirect SPA necesario para las rutas de React Router.

Pasos (Netlify):

1. Conecta el repositorio en Netlify (base directory: `webpage/` si el repo es un monorepo).
2. En **Site configuration → Environment variables**, agrega las tres variables `VITE_*` de
   arriba (son públicas, no hay secretos que proteger en el hosting).
3. Configura reCAPTCHA en el dashboard de Web3Forms (ver sección de arriba).
4. Deploy.

## Rutas

`/` · `/como-funciona` · `/integraciones` · `/precios` · `/contacto` · `/terminos` · `/privacidad` ·
`/industrias` · `/industrias/:slug` (19 industrias, ver `src/data/industries.ts`)

El formulario de `/contacto` preselecciona campos según query params:
`?plan=basico|pro|enterprise`, `?tipo=integracion`, `?motivo=demo|recomendacion`.

## SEO, Google Analytics y Google Search Console

- **Dominio configurado:** `https://sendwary.com` (`src/lib/seo.ts`, `index.html`,
  `public/sitemap.xml`, `public/robots.txt`).
- **Google Analytics:** `G-NCENLH8H31`, cargado en `index.html` (script `gtag.js` estándar de
  Google, una sola vez, sin duplicados).
- **`sitemap.xml`:** `public/sitemap.xml` — home + páginas principales + las 19 industrias, con
  `lastmod`, `changefreq` y `priority`.
- **`robots.txt`:** `public/robots.txt` — permite todo el rastreo y apunta al sitemap.
- **Metadata por página:** componente `SEOHead` (`src/components/seo/SEOHead.tsx`), usado en
  cada página para actualizar `title`, `meta description`, `canonical`, Open Graph, Twitter Card
  y JSON-LD según la ruta. Las páginas de industrias usan `seoTitle`/`seoDescription` ya
  definidos en `src/data/industries.ts`.
- **JSON-LD:** `Organization` estático en `index.html` (sitewide); `SoftwareApplication` en `/`;
  `SoftwareApplication` con 3 `Offer` (Básico/Pro/Enterprise) en `/precios`.
- **Imagen Open Graph:** `public/og-image.png` (1200×630), generada con el logo real y branding
  del sitio.

### Limitación conocida (sitio 100% CSR, sin SSR)

`SEOHead` actualiza el `<head>` con JavaScript en cada ruta, y Google sí lo indexa (renderiza la
página antes de indexar). Pero los bots de vista previa de redes sociales (Facebook, WhatsApp,
Twitter/X, LinkedIn) **no ejecutan JavaScript** — solo leen el HTML estático de `index.html`. Por
eso, al compartir cualquier URL del sitio, la vista previa siempre mostrará el título/descripción/
imagen de la **homepage** (los que están fijos en `index.html`), no los de la página específica.
Si en el futuro se necesita que cada ruta tenga su propia vista previa social, la solución es
migrar a SSR o agregar un paso de prerenderizado — no se implementó aquí por ser un cambio de
arquitectura fuera del alcance de esta tarea.

### Cómo probar

```bash
npm run build && npm run preview
```

- Abre `http://localhost:4173/sitemap.xml` y `http://localhost:4173/robots.txt` (o, ya en
  producción, `https://sendwary.com/sitemap.xml` y `https://sendwary.com/robots.txt`) y confirma
  que cargan como XML/texto plano, sin error 404.
- Navega entre páginas y revisa en DevTools → Elements que `<title>`, `meta[name="description"]`
  y `link[rel="canonical"]` cambian por ruta.
- Para validar Open Graph/Twitter Card, usa una herramienta de "preview" (p. ej. la de
  Facebook Sharing Debugger o Twitter Card Validator) con la URL de producción.
- Para cambiar la imagen Open Graph, reemplaza `public/og-image.png` (1200×630) o ajusta
  `DEFAULT_OG_IMAGE` en `src/lib/seo.ts`.

### Enviar el sitemap a Google Search Console

La propiedad de `https://sendwary.com` ya debe estar agregada (por DNS o meta tag, gestionado
fuera de este repo). Pasos:

1. Entra a [Google Search Console](https://search.google.com/search-console).
2. Abre la propiedad de `https://sendwary.com`.
3. Ve a **Sitemaps**.
4. Envía `sitemap.xml` (o la URL completa `https://sendwary.com/sitemap.xml`).
5. Usa **URL Inspection** para pedir indexación de:
   - `https://sendwary.com/`
   - `https://sendwary.com/precios`
   - `https://sendwary.com/contacto`
   - `https://sendwary.com/como-funciona`
   - `https://sendwary.com/integraciones`
6. Repite la inspección/indexación para el resto de páginas según convenga.

### Checklist post-deploy

```txt
[ ] Verificar que https://sendwary.com/sitemap.xml abre correctamente.
[ ] Verificar que https://sendwary.com/robots.txt abre correctamente.
[ ] Enviar sitemap en Google Search Console.
[ ] Inspeccionar homepage con URL Inspection.
[ ] Inspeccionar /precios, /contacto, /como-funciona e /integraciones.
[ ] Verificar que Google Analytics recibe eventos en tiempo real (Realtime en GA4).
[ ] Confirmar que no hay páginas públicas con noindex.
[ ] Probar preview de Open Graph con la URL de producción.
[ ] Revisar titles y descriptions principales.
```

## Antes de publicar (checklist de dominio)

- [x] Dominio real (`https://sendwary.com`) en `public/robots.txt`, `public/sitemap.xml` e
      `index.html` (metadatos Open Graph / Twitter / canonical / JSON-LD).
- [x] Correo de contacto actualizado a `info@sendwary.com` en las páginas legales
      (`/terminos`, `/privacidad`) y en el footer (`CONTACT_EMAIL`).
- [ ] Completar el nombre legal de la empresa (`[Nombre legal de la empresa]`) en las páginas legales.
- [ ] Añadir las URLs reales de redes sociales en `src/components/layout/Footer.tsx`.
- [ ] Revisión legal de `/terminos` y `/privacidad`.
