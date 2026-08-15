# Sendwary Data, Realtime & Pagination Skill

## Purpose

Use this skill for dashboard accuracy, live data refresh, polling/SSE/WebSockets, backend filters, pagination, query invalidation, list consistency, and DB-backed metrics.

## Core Principle

All displayed data must reflect real database state.

Avoid:

* mock counts
* stale local filtering
* frontend-only filtering on paginated data
* hardcoded dashboard numbers
* cross-tenant data leakage

## Realtime Strategy

Preferred for QA:

* Polling + query invalidation.
* Use React Query if available.
* If not available, use controlled hooks with intervals.

Suggested intervals:

* Dashboard: 15–30 seconds
* Active conversation: 5–10 seconds
* Conversation list: 5–15 seconds
* Appointments: 30 seconds
* Billing/usage: 30–60 seconds
* Admin: 60 seconds or manual refresh

If SSE/WebSockets already exist, use them with polling fallback.

## Dashboard Metrics

Dashboard must calculate from DB:

* total conversations
* open conversations
* conversations requiring human
* messages today
* messages this month
* upcoming appointments
* pending appointments
* active products/services
* active agents
* plan usage
* token usage
* call minutes usage
* support tickets if relevant

Rules:

* Tenant dashboard filters by tenantId.
* Admin dashboard aggregates globally.
* If no data, show real zero.
* Do not show fake/sample values.

## Query Invalidation

After mutations, refresh affected data:

* create/update/delete appointment
* create/update/delete catalog item
* new WhatsApp message
* manual reply
* conversation takeover/release/close
* create/update agent
* usage counter change
* call completed
* support ticket created/updated
* billing change

## Pagination Contract

Preferred response:

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

Frontend should normalize legacy response shapes.

## Filter Rules

All meaningful filters must be applied in backend.

Do not filter only the current frontend page.

When filters change, reset page to 1.

Filters include:

* search
* status
* priority
* category
* type
* dateFrom
* dateTo
* agentId
* assignedTo
* labelId
* unread
* needsHuman

## Appointments Default

Appointments should default to last 30 days.

If no date filters are provided:

* dateFrom = today - 30 days
* dateTo = today

Allow user to clear/change filters.

## Search Behavior

Use debounce around 300ms.

When search changes:

```txt
page = 1
fetch backend with search and filters
```

Avoid bug:

```txt
searching from page 5 and seeing empty pages before matching results
```

## List UX

Show:

* total results
* page
* limit selector
* next/previous
* clear filters
* “No encontramos resultados con estos filtros.”

## Data Audit Docs

For major consistency changes, create:

```txt
docs/DATA_CONSISTENCY_AUDIT.md
```

Include:

* screen
* endpoint
* DB source
* filters
* tenant enforcement
* refresh strategy
* risks
* fixes

## Testing

Test:

* counts match DB
* search resets page
* filters apply backend
* totals are filtered totals
* no cross-tenant data
* dashboard updates after mutation
* appointments default last 30 days
* conversations update after WhatsApp message
* pagination never shows empty earlier pages when results exist later
