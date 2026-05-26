# Esquema de Base de Datos

## Entidades principales

### Business

Representa una ferretería o empresa.

Campos sugeridos:

- id
- name
- rnc
- phone
- address
- logoUrl
- createdAt
- updatedAt

### Product

Representa un producto disponible para cotizar.

Campos sugeridos:

- id
- businessId
- sku
- name
- category
- brand
- description
- unit
- price
- stock
- imageUrl
- isActive
- createdAt
- updatedAt

### ProductAlias

Representa sinónimos, nombres técnicos o errores comunes.

Campos sugeridos:

- id
- productId
- alias
- aliasType

Tipos de alias:

- SYNONYM
- COMMON_MISTAKE
- TECHNICAL_NAME

### Customer

Representa al cliente que escribe por WhatsApp.

Campos sugeridos:

- id
- businessId
- name
- phone
- createdAt
- updatedAt

### Conversation

Representa una conversación activa o histórica.

Campos sugeridos:

- id
- businessId
- customerId
- status
- lastMessageAt
- currentQuoteId
- requiresHuman
- createdAt
- updatedAt

### Message

Representa cada mensaje enviado o recibido.

Campos sugeridos:

- id
- conversationId
- direction
- senderType
- content
- messageId
- metadata
- createdAt

### Quote

Representa una cotización.

Campos sugeridos:

- id
- businessId
- customerId
- conversationId
- quoteNumber
- status
- subtotal
- taxRate
- taxAmount
- total
- pdfUrl
- validUntil
- createdAt
- updatedAt

### QuoteLine

Representa una línea de producto dentro de la cotización.

Campos sugeridos:

- id
- quoteId
- productId
- productName
- quantity
- unit
- unitPrice
- subtotal
- createdAt

### HumanHandoff

Representa un caso pasado a vendedor humano.

Campos sugeridos:

- id
- businessId
- conversationId
- reason
- status
- assignedTo
- createdAt
- resolvedAt

### AgentLog

Representa decisiones tomadas por el agente.

Campos sugeridos:

- id
- conversationId
- input
- output
- intent
- confidence
- requiresHuman
- createdAt