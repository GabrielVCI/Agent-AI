# Sendwary AI Agents Skill

## Purpose

Use this skill for AI runtime, prompt builder, agent behavior, OpenAI integration, ElevenLabs audio/calls orchestration, classification, actions, cost control, and natural conversation quality.

## Architecture

* OpenAI handles text reasoning, classification, decisions, and response generation.
* ElevenLabs handles audio transcription, voice, and calls.
* Sendwary orchestrates context, tools, limits, safety, billing, and handoff.

## Agent Runtime Input

The runtime should receive:

```ts
{
  tenantId: string;
  agentId: string;
  conversationId?: string;
  customerMessage: string;
  source: "test" | "whatsapp" | "whatsapp_audio" | "voice_call" | string;
  channel: "TEXT" | "AUDIO" | "VOICE" | "WHATSAPP" | string;
  customerPhone?: string;
}
```

## Agent Runtime Output

The runtime should return:

```ts
{
  replyText: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  decision?: object;
  actions?: object[];
  requiresHuman?: boolean;
  confidence?: number;
  intent?: string;
  outcome?: string;
  costControlReason?: string;
}
```

## Prompt Builder

A professional Sendwary agent prompt must include:

1. Agent identity
2. Business identity
3. Current channel
4. Agent goal
5. Tone
6. Base instructions
7. Business info
8. Catalog context
9. Knowledge/document context
10. Appointments/availability context
11. Recent conversation history
12. Safety rules
13. Escalation rules
14. Cost-control rules

## Natural Conversation Rules

Agents must:

* Be short, useful, and natural.
* Avoid robotic phrases.
* Never say “as an AI model”.
* Avoid repeated greetings.
* Ask only one follow-up question at a time.
* Adapt to the customer’s tone.
* Use professional but friendly Spanish by default.
* Not invent prices.
* Not invent availability.
* Not invent policies.
* Ask clarification if data is missing.
* Escalate to human when appropriate.

## Decision Types

Supported intents:

```txt
GREETING
PRODUCT_INQUIRY
SERVICE_INQUIRY
QUOTE_REQUEST
APPOINTMENT_REQUEST
SUPPORT_REQUEST
HUMAN_REQUEST
COMPLAINT
OFF_TOPIC
SPAM
WRONG_NUMBER
UNKNOWN
```

Supported outcomes:

```txt
PRODUCTIVE
NEEDS_INFO
NEEDS_HUMAN
NOT_RELATED
SPAM
WRONG_NUMBER
COMPLETED
```

## Actions

Supported action concepts:

```txt
ANSWER
SEARCH_CATALOG
SEARCH_KNOWLEDGE
CREATE_APPOINTMENT
CHECK_AVAILABILITY
REQUEST_HUMAN
ASK_CLARIFICATION
CLOSE_UNPRODUCTIVE
```

Never trust AI output blindly. Validate actions server-side.

## Catalog Rules

* Use real catalog data.
* Search by name, description, category, type.
* If product is not found, do not invent.
* If price is missing, do not invent.
* If quantity is 0, say availability should be confirmed.
* Services do not have stock.

## Documents/Knowledge Rules

* Use relevant snippets.
* Do not inject huge documents into the prompt.
* Do not hallucinate from missing documents.
* If uncertain, ask or escalate.

## Appointments Rules

To create an appointment, collect:

* customer name
* customer phone
* service/product
* date
* time

Validate:

* business hours
* slot availability
* not in the past
* max appointments per slot

If availability is unknown:

* create pending request or ask for confirmation.
* do not promise confirmed availability.

## Cost Control

Before spending model tokens or call minutes:

* classify the message/call.
* detect spam/off-topic/wrong number.
* avoid repeated expensive calls.
* close or escalate unproductive conversations.
* stop calls that are not related to the business when possible.

## Fallbacks

Use natural fallbacks:

* “No tengo ese precio configurado todavía. ¿Quieres que lo pase a un asesor?”
* “Puedo ayudarte con información del negocio, servicios, productos o citas.”
* “Entendido, disculpa la molestia. No te escribiremos más por esta conversación.”
* “No pude entender bien el audio. ¿Puedes enviarlo nuevamente o escribir tu solicitud por aquí?”
* “Dame un momento, voy a pasar tu solicitud a un asesor para ayudarte mejor.”

## Testing

Test every runtime change with:

* product exists
* product not found
* appointment complete
* appointment missing data
* human request
* wrong number
* off-topic
* angry customer
* audio transcription
* call transcript
* OpenAI failure
* invalid AI JSON

## Build

After AI changes:

* Run backend typecheck/build.
* Confirm WhatsApp real flow still uses same runtime.
* Confirm `POST /api/agents/:id/test` uses same runtime.
