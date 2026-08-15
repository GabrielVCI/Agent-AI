# Sendwary Core Context Skill

## Purpose

Use this skill as the global context for every Sendwary development task.

Sendwary is a SaaS platform for AI agents that help businesses automate customer attention, sales, appointments, quotes, support, WhatsApp conversations, audio messages, calls, catalog questions, and human handoff.

## Stack

* Backend: Node.js + Express + TypeScript
* ORM: Prisma
* Database: PostgreSQL
* Frontend: React + Vite + TypeScript + Tailwind
* Auth: httpOnly cookies
* Deployment:

  * Frontend: Netlify
  * Backend: Railway
  * Database: Azure PostgreSQL or compatible PostgreSQL

## Hard Rules

* Do not use JWT in the frontend.
* Do not store auth tokens in localStorage.
* Do not expose API keys in the frontend.
* Do not expose Meta, OpenAI, ElevenLabs, LemonSqueezy, Google, or database secrets.
* Do not reset the database.
* Do not create migrations without explaining why first.
* Do not break authentication.
* Do not break WhatsApp.
* Do not break agents.
* Do not break conversations.
* Do not break billing.
* Do not break admin.
* Always audit before modifying.
* Always explain files modified.
* Always run backend/frontend build or typecheck when code is changed.

## Roles

* SUPER_ADMIN: Sendwary platform owner. Uses admin panel.
* OWNER: owner of a tenant/company.
* ADMIN: admin user inside a tenant.

## Access Rules

* SUPER_ADMIN can access admin modules.
* OWNER/ADMIN can access tenant modules.
* OWNER/ADMIN must not access admin-only endpoints.
* SUPER_ADMIN must not mount tenant pages without tenant context.
* All tenant data must be filtered by tenantId.
* Cross-tenant data leaks are critical bugs.

## Product Modules

Expected modules:

* Auth
* Register
* Google OAuth
* Password recovery
* Onboarding
* Tenants/companies
* Admin panel
* Manual tenant provisioning
* Plans
* Subscriptions
* LemonSqueezy billing
* Manual billing
* Usage limits
* WhatsApp setup
* WhatsApp webhook
* Agents
* Agent training
* Catalog
* Categories
* Inventory basic
* Knowledge/documents
* Conversations inbox
* Human handoff
* Appointments
* Availability
* Excel appointments import/export
* ElevenLabs audio/calls
* Support assistant
* Support playbooks
* Dashboard
* Account
* Realtime/polling
* Error handling
* Rate limiting

## Brand

Official brand name: Sendwary.

Use the Sendwary logo from the frontend public folder:

```txt
frontend/public/logo.png
```

Do not use absolute Windows paths in production.

## Plans

### Basic

* Code: BASIC
* Price: USD 40/month
* Setup fee: USD 250
* Monthly message limit: 3,000
* Estimated visible range: 1,500 to 3,000 messages
* Up to 2 AI agents
* Up to 2 WhatsApp numbers
* 1 user
* WhatsApp inbox
* Basic dashboard
* Quotes
* WhatsApp audio processing
* Manual catalog/documents for AI context
* Human intervention
* Basic support

### Pro

* Code: PRO
* Price: USD 60/month
* Setup fee: USD 450
* Monthly message limit: 6,000
* Estimated visible range: 3,000 to 6,000 messages
* Up to 4 users
* More agents/numbers than Basic
* Catalog
* Bulk catalog upload
* AI appointments/consultations
* Reports
* Priority support
* Popular plan

### Enterprise

* Code: ENTERPRISE
* Price: USD 90/month
* Setup fee: from USD 600
* Monthly message limit: 10,000 initially, configurable
* Estimated visible range: 6,000 to 10,000 messages
* Up to 10 users initially, configurable
* Advanced integrations under evaluation
* CRM/internals systems under evaluation
* Odoo/SAP/QuickBooks under evaluation
* Custom automations
* Advanced reporting
* AI calls allowed

## Voice Minutes

Only Enterprise can use AI calls.

ElevenLabs reference costs:

* Creator includes 275 call minutes/month.
* Additional minutes: USD 0.08/min.
* Gemini 2.5 Flash: USD 0.31/month deducted from ElevenLabs credits.

Sendwary business rule:

* Dedicate about USD 15 per Enterprise user for calls.
* Calculation: 15 / 0.08 = 187.5 minutes.
* With Gemini cost: (15 - 0.31) / 0.08 = 183.62 minutes.
* Safe default quota: 180 call minutes/month per Enterprise user.

## AI Architecture

* OpenAI: text reasoning, classification, response generation, agent decisions.
* ElevenLabs: audio transcription, voice, calls.
* Sendwary: orchestration, limits, routing, tenant context, catalog, documents, appointments, human handoff, cost control.

## Agent Rules

Agents must:

* Sound natural and professional.
* Avoid robotic language.
* Never say “as an AI model”.
* Avoid repeating greetings.
* Ask one follow-up question at a time.
* Use business context.
* Use catalog data.
* Use documents/knowledge.
* Use appointment availability.
* Use conversation history.
* Never invent prices.
* Never invent availability.
* Never invent policies.
* Escalate to human when necessary.
* Detect off-topic, spam, wrong number, and unproductive calls/messages.
* Avoid unnecessary token/minute spending.

## LemonSqueezy

Billing will use LemonSqueezy overlay checkout.

Manual billing must continue to exist for SUPER_ADMIN-created clients.

The system must support:

* Manual subscriptions
* Custom plans
* LemonSqueezy subscriptions
* Paywall for users without active plan
* Subscription ID displayed in account/billing
* Webhook activation
* Test mode/live mode separation

## Development Workflow

For every task:

1. Audit first.
2. Identify current files and contracts.
3. Explain if migration is needed.
4. Make minimal safe changes.
5. Preserve existing working flows.
6. Use friendly errors.
7. Run builds/typecheck.
8. Summarize changed files, tests, and pending work.
