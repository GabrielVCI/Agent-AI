# Feature Release Checklist

Toda feature nueva o modificada debe cumplir esto ANTES de considerarse lista:

- [ ] **Implementación** completa y revisada.
- [ ] **Builds**: backend (`tsc`) y frontend (`tsc -b && vite build`) en verde.
- [ ] **Pruebas**: escenarios felices + errores comunes ejercitados.
- [ ] **Variables env** nuevas documentadas (env.ts con default seguro + doc en `backend/docs/` si aplica).
- [ ] **Support playbook** actualizado o creado en `docs/support-playbooks/`:
  - [ ] errores comunes y síntomas reales de la feature
  - [ ] pasos de diagnóstico con los endpoints de soporte
  - [ ] qué puede resolver el agente de soporte (Tier 1) y qué no
  - [ ] logs y prefijos (`[FEATURE]`) que emite
  - [ ] tier y riesgo definidos
- [ ] **Índice** (`SUPPORT_PLAYBOOK_INDEX.md`) actualizado si hay playbook nuevo.
- [ ] **Owner/responsable** anotado en el playbook si la feature tiene dueño específico.
- [ ] **Sin secrets** en código, logs ni respuestas de API (solo `configured: true/false`).
- [ ] **Roles** verificados: tenant no ve datos de otros tenants; escrituras sensibles solo SUPER_ADMIN.
