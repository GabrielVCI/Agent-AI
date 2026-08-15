# Sendwary Support Operations Skill

## Purpose

Use this skill for support assistant, support tickets, support tiers, support playbooks, production support context, incident response, and operational troubleshooting.

## Support Philosophy

The support assistant must be safe, structured, and limited.

It can:

* read safe context
* classify problems
* search playbooks
* suggest fixes
* create tickets
* escalate issues
* summarize incidents

It must not:

* read secrets
* expose tokens
* run arbitrary SQL
* delete data
* change billing without approval
* change plans without approval
* perform destructive actions
* access other tenants without SUPER_ADMIN permission

## Support Tiers

### Tier 1 — Known Issues

Known, common issues with clear fixes.

Examples:

* wrong password
* Google OAuth misconfigured
* WhatsApp phone_number_id missing
* agent inactive
* plan limit reached
* audio disabled
* webhook verify token wrong
* appointment hidden by filters
* catalog empty

Can provide automated guidance or safe allowlisted actions.

### Tier 2 — Assisted Triage

Unknown or ambiguous problems.

Examples:

* intermittent errors
* AI responds poorly
* conversation not appearing
* OAuth failure unclear
* Excel import issues
* billing inconsistent
* dashboard stale
* performance issue

Must gather context, create ticket, and escalate to SUPER_ADMIN if needed.

### Tier 3 — Incident Response

Serious or system-wide problems.

Examples:

* global outage
* DB unreachable
* widespread 500s
* WhatsApp webhook down for multiple tenants
* possible data leak
* billing charged incorrectly
* abnormal token/minute usage
* rate limiter blocking production traffic

Must create incident and notify SUPER_ADMIN.

## Playbooks

Create markdown playbooks:

```txt
docs/support-playbooks/auth.md
docs/support-playbooks/google-oauth.md
docs/support-playbooks/whatsapp.md
docs/support-playbooks/agents.md
docs/support-playbooks/conversations.md
docs/support-playbooks/catalog.md
docs/support-playbooks/appointments.md
docs/support-playbooks/billing.md
docs/support-playbooks/lemonsqueezy.md
docs/support-playbooks/elevenlabs.md
docs/support-playbooks/voice-minutes.md
docs/support-playbooks/password-recovery.md
docs/support-playbooks/database.md
docs/support-playbooks/deployment.md
docs/support-playbooks/incidents.md
```

Each playbook should include:

* Feature
* Description
* Common symptoms
* Diagnosis
* Resolution steps
* Automated actions allowed
* Human escalation rules
* Risk level
* Related logs
* Related env vars
* Related endpoints

## Ticket Model

SupportTicket should track:

* tenant
* user
* title
* description
* status
* tier
* severity
* category
* source
* AI summary
* detected issue
* recommended action
* resolution
* metadata

## Safe Support Context

Support API can return:

* tenant status
* plan status
* usage
* agents active/inactive
* WhatsApp config presence
* phoneNumberId masked/visible if safe
* integration configured true/false
* recent safe error summaries

Support API must not return:

* full tokens
* API keys
* passwords
* cookies
* raw auth headers
* full sensitive conversations unless explicitly authorized

## Support Agent Runtime

Separate from tenant commercial agents.

Suggested files:

```txt
support-agent/
support-agent.service.ts
support-playbook.service.ts
support-triage.service.ts
support-tools.service.ts
```

## Development Rule

Every new feature must update its support playbook.

If no playbook exists, create one.

## Testing

Test:

* known WhatsApp issue
* agent inactive
* plan limit reached
* OAuth problem
* unknown issue
* simulated incident
* OWNER cannot access support admin
* no secrets exposed
* support tickets list does not 500