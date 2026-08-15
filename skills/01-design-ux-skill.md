# Sendwary Design & UX Skill

## Purpose

Use this skill for frontend UI, UX, layout, responsive design, branding, login/register screens, dashboard layout, sidebar, forms, tables, cards, empty states, modals, and visual polish.

## Scope

This skill applies to:

* Login
* Register
* Forgot password
* Reset password
* Onboarding
* Dashboard
* Sidebar
* Topbar
* Conversations inbox
* Agents
* Training
* Catalog
* Categories
* Appointments
* Company/Empresa
* Account
* Billing
* Admin
* Support
* Integrations
* Mobile responsive behavior

## Brand

* Product name: Sendwary.
* Use logo from `/logo.png`.
* Do not use old names such as Ferretería AI, Client Captor, Acme Corp, or demo labels unless explicitly needed in mocks.
* The UI should feel modern, professional, SaaS-like, clean, and commercially presentable.

## Design Principles

* Compact but readable.
* Good spacing.
* No wasted vertical space.
* No horizontal overflow on mobile.
* Forms should be clear and fast to complete.
* Tables should be responsive.
* Mobile should use cards or stacked layouts.
* Desktop should use efficient grids and tables.
* Empty states must be helpful.
* Loading states must be subtle.
* Error states must be friendly.
* Avoid giant filters stacked vertically on desktop.
* Use compact filter bars.

## Layout Rules

### Desktop

Use consistent page containers:

```txt
max-width: full available layout
padding: 24px to 32px
gap: 16px to 24px
```

### Mobile

Use:

```txt
padding: 16px
single-column forms
cards instead of wide tables
drawers or modals for secondary panels
```

## Catalog UX

Catalog must be compact.

Desktop:

* Header with title, description, and action buttons.
* Search and filters in a horizontal bar.
* Table or compact cards.
* Fields visible:

  * name
  * category
  * type
  * price
  * ITBIS
  * quantity
  * status
  * actions

Mobile:

* Cards.
* Collapsible filters.
* No horizontal overflow.

## Appointments UX

Appointments must default to the last 30 days.

Desktop filter bar:

```txt
[Search] [Status] [Priority] [From] [To] [Reminder tools] [+ New appointment]
```

Do not stack all filters vertically on desktop.

Mobile:

* Filters can stack.
* Composer/buttons must remain usable.

## Company/Empresa UX

If both Company and Empresa views exist:

* Avoid duplication.
* Choose one official route or clearly separate:

  * Company details
  * Advanced settings

Use compact cards:

* General info
* Contact
* Business hours
* WhatsApp numbers
* AI settings
* Billing if relevant

## Login/Register UX

Use the provided auth component style but connect to real auth logic.

Login:

* Sendwary logo
* Title: “Bienvenido a Sendwary”
* Description: “Automatiza la atención, ventas y citas de tu negocio con agentes IA para WhatsApp.”
* Email/password
* Google button
* Forgot password
* Create account
* No demo alerts
* No mock console-only handlers

Register:

* First name
* Last name
* Email
* Strong password
* Confirm password
* Google option if configured

## Sidebar UX

Use the modern sidebar reference as inspiration:

* Workspace switcher
* Sendwary logo
* Active route state
* Collapsible desktop sidebar
* Mobile drawer
* Role-aware navigation
* Admin nav only for SUPER_ADMIN
* Tenant nav only for OWNER/ADMIN

## Paywall UX

If tenant has no active plan:

* Show mandatory plan selection before dashboard.
* Display Basic, Pro, Enterprise.
* Open LemonSqueezy overlay.
* Do not allow skip.
* Allow logout.

## Error UX

Never show raw error codes as the main message.

Avoid:

```txt
Unauthorized
500
Request failed with status code 500
```

Use:

```txt
Usuario o clave incorrecta.
No tienes permiso para realizar esta acción.
Ocurrió un error inesperado. Intenta nuevamente.
Error de conexión. Revisa tu internet o intenta nuevamente.
```

## Final Requirements

After design changes:

* Run frontend build.
* Check mobile.
* Check desktop.
* Check no broken routes.
* Check no mock text remains.
* Summarize changed files and screenshots/visual areas if possible.
