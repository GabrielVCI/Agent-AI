# Sendwary — Sitio web

Sitio web comercial (multipágina) de **Sendwary**, plataforma SaaS de agentes IA para WhatsApp
Business. Construido con **Vite + React + TypeScript + Tailwind CSS** y **React Router**.
El formulario de contacto se envía mediante una **Netlify Function** con **Resend**.

## Requisitos

- Node.js 18+ y npm.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

### Probar el formulario de contacto (Netlify Function) en local

El envío real de correo requiere las variables de entorno y el runtime de Netlify:

```bash
cp .env.example .env      # y completa las claves reales
npx netlify dev           # sirve el sitio + la función en /.netlify/functions/contact
```

Sin `netlify dev`, el sitio funciona pero el formulario mostrará el estado de error al enviar
(comportamiento esperado, no rompe la app).

## Build de producción

```bash
npm run build     # tsc -b && vite build → genera /dist
npm run preview   # sirve /dist localmente
```

## Variables de entorno

Definidas en `.env.example`. Las **secretas** solo se usan en el servidor (Netlify Function);
**no** usar el prefijo `VITE_` para secretos.

| Variable | Tipo | Descripción |
| --- | --- | --- |
| `RESEND_API_KEY` | secreta | API key de Resend (https://resend.com/api-keys). |
| `CONTACT_FROM_EMAIL` | secreta | Remitente verificado en Resend (dominio verificado). |
| `CONTACT_TO_EMAIL` | secreta | Bandeja del negocio que recibe las solicitudes. |
| `CONTACT_REPLY_TO_EMAIL` | secreta | Opcional. Si se omite, se responde al email del visitante. |
| `CONTACT_SITE_NAME` | secreta | Nombre en los correos (por defecto `Sendwary`). |
| `VITE_CONTACT_ENDPOINT` | pública | URL del endpoint (por defecto `/.netlify/functions/contact`). |

## Deploy en Netlify

La configuración está en `netlify.toml`:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions`
- **Redirect SPA:** `/* → /index.html` (200), necesario para las rutas de React Router.

Pasos:

1. Conecta el repositorio en Netlify (base directory: `webpage/` si el repo es un monorepo).
2. En **Site settings → Environment variables**, agrega las variables secretas de arriba.
3. Verifica el dominio remitente en Resend.
4. Deploy.

## Rutas

`/` · `/como-funciona` · `/integraciones` · `/precios` · `/contacto` · `/terminos` · `/privacidad`

El formulario de `/contacto` preselecciona campos según query params:
`?plan=basico|pro|enterprise`, `?tipo=integracion`, `?motivo=demo|recomendacion`.

## Antes de publicar (checklist de dominio)

- [ ] Reemplazar `https://tudominio.com` en `public/robots.txt`, `public/sitemap.xml` e `index.html`
      (metadatos Open Graph / Twitter) por el dominio real.
- [ ] Actualizar el correo de contacto (`contacto@tudominio.com`) en `.env`, en las páginas legales
      (`/terminos`, `/privacidad`) y en el footer (`CONTACT_EMAIL`).
- [ ] Completar el nombre legal de la empresa (`[Nombre legal de la empresa]`) en las páginas legales.
- [ ] Añadir las URLs reales de redes sociales en `src/components/layout/Footer.tsx`.
- [ ] (Opcional) Crear una imagen Open Graph dedicada (1200×630) y actualizar `og:image` / `twitter:image`.
- [ ] Revisión legal de `/terminos` y `/privacidad`.
