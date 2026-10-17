# Sendwary — Locked Decisions

Decisiones CERRADAS. No se reabren sin una razón de peso documentada aquí.
Formato: **Decisión · Razón · Implicación · Qué NO se hará por ahora.**

---

**1. Marca oficial: Sendwary.**
- Razón: nombre propio, disponible y consistente en panel, landing y docs.
- Implicación: toda UI, correo y doc usa "Sendwary"; el repo interno puede seguir llamándose ferreteria-ai-agent sin afectar la marca.
- NO por ahora: renombrar el repositorio ni los paquetes.

**2. Auth frontend: cookies httpOnly. No JWT ni localStorage.**
- Razón: XSS no puede robar la sesión; revocación server-side real (tabla Session + Redis).
- Implicación: CORS con credentials; en prod cross-domain se requiere `COOKIE_DOMAIN`/subdominios; el frontend jamás maneja tokens.
- NO por ahora: JWT en frontend, tokens en localStorage, auth headers Bearer para usuarios.

**3. Backend: Node.js + Express + TypeScript.**
- Razón: velocidad de desarrollo, ecosistema, tipado.
- Implicación: patrón routes→controllers(zod)→services→Prisma en todo módulo nuevo.
- NO por ahora: migrar a Nest/Fastify/microservicios.

**4. Frontend: React + Vite + TypeScript + Tailwind.**
- Razón: stack probado del equipo; Vite para builds rápidos.
- Implicación: componentes ui propios (Card/Button/Modal/Badge...); sin librería de componentes pesada.
- NO por ahora: Next.js/SSR, shadcn completo, design system externo.

**5. DB: PostgreSQL con Prisma (v7, driver adapter pg).**
- Razón: relacional multi-tenant, tipado end-to-end.
- Implicación: ⚠️ drift conocido → SIEMPRE `prisma db push`, NUNCA `migrate dev/reset`; JSON columns (metadata) para evolucionar sin migraciones pesadas.
- NO por ahora: MongoDB, migraciones formales versionadas hasta resolver el drift.

**6. Deploy: Netlify (frontend) + Railway (backend) + PostgreSQL Azure o compatible.**
- Razón: bajo costo operativo, cero DevOps dedicado.
- Implicación: cookies/CORS/OAuth configurados para dominios separados o subdominios; envs por entorno.
- NO por ahora: Kubernetes, AWS custom, multi-región.

**7. IA de texto/razonamiento: OpenAI.**
- Razón: JSON schema estricto confiable para la decisión estructurada del runtime.
- Implicación: modelos configurables por env/agente (default gpt-4.1-mini); todo consumo se registra.
- NO por ahora: multi-proveedor LLM, modelos locales.

**8. Audio, voz y llamadas: ElevenLabs.**
- Razón: STT (scribe_v1) + Conversational AI en un solo proveedor; webhook firmado.
- Implicación: API key solo backend; loop de voz en vivo lo maneja ElevenLabs, Sendwary sincroniza prompt y procesa post-call.
- NO por ahora: Twilio/Vonage, pipeline de voz propio, Whisper como STT primario (solo fallback opcional).

**9. WhatsApp: Meta Cloud API oficial.**
- Razón: cumplimiento y estabilidad (nada de librerías no oficiales tipo baileys).
- Implicación: modelo BSP centralizado hoy (token global + phone_number_id por agente); ventana de 24h y plantillas aplican.
- NO por ahora: WhatsApp Web scraping, proveedores no oficiales; credenciales por tenant es fase futura ya diseñada.

**10. Cobros online futuros: LemonSqueezy con overlay embebido.**
- Razón: merchant of record (impuestos resueltos), overlay sin salir del panel.
- Implicación: webhook firmado ya preparado; variant IDs por plan en envs.
- Implicación: la ÚNICA autoridad que activa una suscripción es el webhook del
  primer cobro (`subscription_payment_success` con `billing_reason=initial` y
  `status=paid`). `subscription_created` solo correlaciona tenant y plan; ni el
  overlay, ni `Checkout.Success`, ni la redirección conceden acceso.
- NO por ahora: Stripe, pasarelas locales, cobro dentro del chat.

**11. Billing manual permitido desde SUPER_ADMIN.**
- Razón: ventas B2B directas con acuerdos personalizados desde el día 1.
- Implicación: Subscription con billingMode MANUAL/CUSTOM, precios y límites negociados por tenant.
- NO por ahora: exigir checkout online para activar clientes.

**12. Solo Enterprise usa llamadas IA.**
- Razón: costo por minuto alto; feature diferenciadora del plan mayor.
- Implicación: entitlement verificado en tools en vivo y post-call; upsell claro.
- NO por ahora: llamadas en Básico/Pro ni como add-on.

**13. Cuota inicial de llamadas: 180 min/mes por usuario Enterprise.**
- Razón: presupuesto seguro (~US$15/usuario/mes de costo ElevenLabs).
- Implicación: configurable por SUPER_ADMIN (override por tenant); contadores idempotentes por llamada.
- NO por ahora: minutos ilimitados ni acumulables entre meses.

**14. Plan Básico: límite técnico 3,000 mensajes/mes (US$40 + US$250 impl.).**
- Razón: margen sano sobre costo de tokens/infra en el rango 1,500–3,000.
- Implicación: enforcement automático; el inbox sigue recibiendo al agotar.
- NO por ahora: mensajes ilimitados ni rollover.

**15. Plan Pro: límite técnico 6,000 mensajes/mes (US$60 + US$450 impl.).**
- Razón/Implicación: igual que #14 en el rango 3,000–6,000; incluye audio y documentos.
- NO por ahora: rebajar features de Pro a Básico.

**16. Enterprise: límite inicial 10,000 mensajes/mes, configurable (US$90 + desde US$600 impl.).**
- Razón: clientes grandes negocian volumen; el override por tenant ya existe.
- Implicación: SUPER_ADMIN ajusta customMonthlyMessageLimit sin tocar código.
- NO por ahora: un cuarto plan público.

**17. SUPER_ADMIN puede crear clientes manualmente.**
- Razón: onboarding asistido de los primeros clientes (venta consultiva con implementación).
- Implicación: panel /admin/clientes con creación de tenant+owner+plan; convive con el registro self-service.
- NO por ahora: impersonation de tenants (documentado como futuro con diseño de seguridad).

**18. Catálogo básico, no inventario avanzado.**
- Razón: el agente necesita nombre/precio/ITBIS/stock simple para vender; un ERP no es el producto.
- Implicación: stock manual informativo; servicios sin stock; alias para lenguaje coloquial.
- NO por ahora: variantes, almacenes, costos, órdenes de compra, sincronización con POS.

**19. Excel inicial vía export/import/plantilla; Microsoft Graph futuro.**
- Razón: valor inmediato sin credenciales Microsoft ni OAuth adicional.
- Implicación: .xlsx local con validación por fila, preview y anti-duplicados (ya implementado); `Integration` (type EXCEL) reservado para la sync futura.
- NO por ahora: Excel Online/Graph en vivo, Google Sheets.

**20. Dashboard/inbox con polling simple; no realtime complejo.**
- Razón: suficiente para QA y primeros clientes; cero infraestructura extra.
- Implicación: `useAutoRefresh` (dashboard 30s, inbox 10s, citas 30s, pausa con pestaña oculta); invalidación tras mutaciones.
- NO por ahora: WebSockets/SSE/colas, hasta que el volumen lo justifique.

**21. No RAG complejo inicialmente; documentos básicos y búsqueda simple primero.**
- Razón: la búsqueda por términos sobre KnowledgeChunk cubre FAQs/políticas sin costo de embeddings.
- Implicación: contexto de documentos entra al prompt como "datos verificados".
- NO por ahora: embeddings, vector DB, re-ranking.

**22. No workflows visuales complejos todavía.**
- Razón: el runtime con intents/acciones cubre los casos comerciales actuales.
- Implicación: la automatización se configura con Entrenamiento + catálogo + citas, no con editores de flujo.
- NO por ahora: builder drag&drop de flujos tipo respond.io/n8n.

**23. respond.io es SOLO referencia funcional.**
- Razón: benchmark de UX de inbox/operación/soporte.
- Implicación: se estudian patrones (takeover, etiquetas, tiers de soporte); diseño y marca propios.
- NO por ahora (ni nunca): copiar marca, diseño exacto o código.

**24. Support assistant: read/triage first; sin acciones peligrosas.**
- Razón: conectar IA a producción exige empezar en solo-lectura auditada.
- Implicación: scopes limitados (read/triage/tickets:write), allowlist de acciones ejecutables VACÍA, Tier 3 bloquea automatismos, todo con audit log; playbooks solo se editan por humanos.
- NO por ahora: writes de billing/planes/usuarios, borrado de datos, SQL generado por IA, autoedición de playbooks.

**25. PgBouncer/pooling preparado para producción.**
- Razón: Railway/Azure con múltiples réplicas agotan conexiones sin pooler.
- Implicación: runtime usa DATABASE_POOL_URL, migraciones DIRECT_URL; driver node-pg compatible transaction mode; doc en backend/docs/db-pooling.md.
- NO por ahora: sharding, réplicas de lectura, particionado.
