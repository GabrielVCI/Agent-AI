# Sendwary Backend API Skill

## Purpose

Use this skill for backend routes, controllers, services, Prisma queries, validation, API contracts, multi-tenant access, and backend architecture.

## Stack

* Node.js
* Express
* TypeScript
* Prisma
* PostgreSQL
* Cookies/session auth

## Hard Rules

* Never reset the database.
* Never create migrations without explaining why.
* Never expose secrets.
* Never return raw stack traces to the frontend.
* Always filter tenant data by tenantId.
* SUPER_ADMIN endpoints must be protected.
* OWNER/ADMIN must never access other tenant data.
* Prefer minimal targeted changes.
* Preserve existing contracts unless intentionally migrated.

## API Response Contract

Prefer:

```json
{
  "success": true,
  "data": {}
}
```

For paginated lists:

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "limit": 20,
    "pages": 0,
    "filters": {}
  }
}
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los datos ingresados."
  }
}
```

## Backend Structure

Prefer structure:

```txt
routes/
controllers/
services/
middlewares/
utils/
config/
errors/
```

Do not duplicate services if equivalent ones exist.

## Multi-Tenant Rules

For tenant endpoints:

* Resolve user from auth session.
* Require tenantId.
* Filter all queries by tenantId.
* Return 403 if user has no tenant and endpoint requires one.
* Return 403 for cross-tenant access.
* SUPER_ADMIN should use admin endpoints, not tenant endpoints.

## Admin Rules

Admin routes must use:

```txt
requireAuth
requireRole(SUPER_ADMIN)
```

Admin can:

* list tenants
* create tenant manually
* assign plans
* set custom billing
* view usage
* manage support tickets
* view safe system health

Admin must not receive secrets.

## Validation

Use existing validation library if present.

Validate:

* body
* params
* query
* tenant ownership
* enum values
* pagination values
* date ranges
* email format
* IDs

## Prisma Rules

* Use schema fields that exist.
* Do not include relations that do not exist.
* Run `prisma generate` after schema changes.
* Use migrations, never reset.
* For production, use `migrate deploy`.

## Common Modules

Backend APIs may include:

* `/api/auth`
* `/api/admin`
* `/api/agents`
* `/api/conversations`
* `/api/catalog`
* `/api/appointments`
* `/api/company`
* `/api/billing`
* `/api/integrations/whatsapp`
* `/api/voice`
* `/api/support`
* `/api/dashboard`

## Error Handling

Use centralized error middleware.

Do not manually return raw error strings.

## Pagination

All paginated endpoints must apply filters in backend, not only frontend.

Rules:

* Search/filter must reset frontend page to 1.
* Backend must return total with filters applied.
* Do not load all records just to filter in frontend.

## Build

After backend changes:

```bash
npm run build
```

or:

```bash
npx tsc --noEmit
```

Use the project’s actual scripts.