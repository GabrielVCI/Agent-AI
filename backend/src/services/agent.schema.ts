export const agentDecisionJsonSchema = {
  name: "agent_decision",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: {
        type: "string",
        enum: [
          "GREETING",
          "SEARCH_PRODUCT",
          "ASK_PRICE",
          "ADD_TO_QUOTE",
          "REMOVE_FROM_QUOTE",
          "GENERATE_QUOTE",
          "ASK_RECOMMENDATION",
          "SCHEDULE_APPOINTMENT",
          "HUMAN_HANDOFF",
          "UNKNOWN"
        ]
      },
      replyText: {
        type: "string"
      },
      productRequests: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            originalText: {
              type: "string"
            },
            normalizedText: {
              type: "string"
            },
            quantity: {
              type: "number"
            },
            unit: {
              type: "string"
            }
          },
          required: ["originalText", "normalizedText", "quantity", "unit"]
        }
      },
      appointmentRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          customerName: { type: "string" },
          serviceText: { type: "string" },
          dateTimeText: { type: "string" },
          isoDateTime: { type: "string" }
        },
        required: ["customerName", "serviceText", "dateTimeText", "isoDateTime"]
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              enum: [
                "SEARCH_PRODUCT",
                "ADD_TO_QUOTE",
                "GENERATE_PDF",
                "ASK_CONFIRMATION",
                "HANDOFF",
                "NONE"
              ]
            },
            payload: {
              type: "object",
              additionalProperties: false,
              properties: {}
            }
          },
          required: ["type", "payload"]
        }
      },
      requiresHuman: {
        type: "boolean"
      },
      confidence: {
        type: "number"
      },
      conversationIntent: {
        type: "string",
        enum: [
          "GREETING",
          "PRODUCT_INQUIRY",
          "SERVICE_INQUIRY",
          "QUOTE_REQUEST",
          "APPOINTMENT_REQUEST",
          "SUPPORT_REQUEST",
          "HUMAN_REQUEST",
          "COMPLAINT",
          "OFF_TOPIC",
          "SPAM",
          "WRONG_NUMBER",
          "UNKNOWN"
        ]
      },
      outcome: {
        type: "string",
        enum: [
          "PRODUCTIVE",
          "NEEDS_INFO",
          "NEEDS_HUMAN",
          "NOT_RELATED",
          "SPAM",
          "WRONG_NUMBER",
          "COMPLETED"
        ]
      }
    },
    required: [
      "intent",
      "replyText",
      "productRequests",
      "appointmentRequest",
      "actions",
      "requiresHuman",
      "confidence",
      "conversationIntent",
      "outcome"
    ]
  },
  strict: true
} as const;