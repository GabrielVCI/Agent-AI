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
      }
    },
    required: [
      "intent",
      "replyText",
      "productRequests",
      "actions",
      "requiresHuman",
      "confidence"
    ]
  },
  strict: true
} as const;