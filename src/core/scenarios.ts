import type {
  BusinessContext,
  JsonObject,
  JsonSchemaObject,
  JsonSchemaValue,
  JsonValue,
  PersonaDefinition,
  ScenarioDefinition,
  ToolSchema,
} from "./model.js";

export const receptionistScenarioProfile: ScenarioDefinition = {
  id: "sample-receptionist",
  name: "Demo Clinic receptionist",
  assistantRole: "Front-desk assistant",
  business: {
    id: "business-demo-clinic",
    name: "Demo Clinic",
    domain: "healthcare",
    description: "A neighborhood clinic that answers patient questions and schedules routine appointments.",
    locale: "en-US",
    attributes: {
      hours: {
        saturday: "9:00 AM to 1:00 PM",
      },
      services: ["new patient intake", "cleaning", "follow-up visit"],
    },
  },
  personaSource: {
    count: 3,
    source: "bundled sample personas",
    generatorPrompt:
      "Create realistic callers for a clinic receptionist. Include general information seekers, availability checkers, and visitors ready to book.",
    personas: [
      {
        id: "persona-general-question",
        label: "General information seeker",
        goals: ["Ask whether the clinic accepts new patients."],
      },
      {
        id: "persona-hours-question",
        label: "Hours checker",
        goals: ["Find the Saturday business hours."],
      },
      {
        id: "persona-scheduler",
        label: "Appointment scheduler",
        goals: ["Find an appointment for a cleaning."],
      },
      {
        id: "persona-booker",
        label: "Ready-to-book visitor",
        goals: ["Book the selected cleaning slot."],
      },
    ],
  },
  toolInventory: {
    source: "bundled sample tool schemas",
    tools: [
      {
        name: "search",
        description: "Search public business knowledge for a concise answer.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "check_availability",
        description: "Check available appointment slots for a requested service.",
        parameters: {
          type: "object",
          properties: {
            service: { type: "string", description: "Requested service name." },
            preferredDate: { type: "string", description: "Preferred appointment date." },
          },
          required: ["service", "preferredDate"],
          additionalProperties: false,
        },
      },
      {
        name: "book_appointment",
        description: "Book an appointment slot for a visitor.",
        parameters: {
          type: "object",
          properties: {
            service: { type: "string", description: "Requested service name." },
            slotId: { type: "string", description: "Chosen appointment slot identifier." },
            visitorName: { type: "string", description: "Visitor name." },
          },
          required: ["service", "slotId", "visitorName"],
          additionalProperties: false,
        },
      },
    ],
  },
  conversationGoals: [
    "Answer public business questions directly when enough information is available.",
    "Use tools for factual lookup, appointment availability, and confirmed bookings.",
    "Confirm important appointment details before closing the conversation.",
  ],
  stoppingRules: {
    maxTurns: 8,
    stopWhen: ["The user has received the requested answer.", "The booking is confirmed or the next step is clear."],
    escalationCriteria: ["The user asks for clinical advice.", "The user reports an emergency."],
  },
  systemPrompt:
    "You are a helpful front-desk assistant for Demo Clinic. Be concise, use tools when needed, and avoid medical advice.",
  metadata: {
    sampleDomain: "receptionist",
  },
};

export const retailSupportScenarioProfile: ScenarioDefinition = {
  id: "sample-retail-support",
  name: "Atlas Outdoor retail support",
  assistantRole: "Retail customer support assistant",
  business: {
    id: "business-atlas-outdoor",
    name: "Atlas Outdoor",
    domain: "retail",
    description: "An outdoor equipment store that helps customers compare products and manage order issues.",
    locale: "en-US",
    attributes: {
      returnWindowDays: 30,
      productCategories: ["backpacks", "trail shoes", "camp kitchen"],
    },
  },
  personaSource: {
    count: 2,
    generatorPrompt:
      "Create retail support shoppers who ask product comparison, order status, or return-policy questions.",
    personas: [
      {
        id: "persona-product-comparison",
        label: "Gear comparer",
        goals: ["Compare two hiking backpacks for a weekend trip."],
      },
      {
        id: "persona-order-return",
        label: "Return policy checker",
        goals: ["Ask whether a recently delivered jacket can be returned."],
      },
    ],
  },
  toolInventory: {
    source: "bundled sample tool schemas",
    tools: [
      {
        name: "lookup_product",
        description: "Look up product details, inventory, and compatibility notes.",
        parameters: {
          type: "object",
          properties: {
            productName: { type: "string", description: "Product or category to look up." },
          },
          required: ["productName"],
          additionalProperties: false,
        },
      },
      {
        name: "lookup_order",
        description: "Look up order status and return eligibility.",
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "Customer order identifier." },
          },
          required: ["orderId"],
          additionalProperties: false,
        },
      },
    ],
  },
  conversationGoals: [
    "Help shoppers choose suitable products from stated needs.",
    "Use order tools for account-specific order or return questions.",
    "State policy limits clearly and hand off when an exception is needed.",
  ],
  stoppingRules: {
    maxTurns: 6,
    stopWhen: ["The shopper has a recommendation, policy answer, or next action."],
    escalationCriteria: ["The shopper requests a refund exception.", "The order lookup result is ambiguous."],
  },
  systemPrompt:
    "You are a retail support assistant for Atlas Outdoor. Give practical product guidance and use tools for order-specific facts.",
  metadata: {
    sampleDomain: "retail",
  },
};

export const bundledScenarioProfiles = [receptionistScenarioProfile, retailSupportScenarioProfile] as const;

export function findBundledScenarioProfile(id: string): ScenarioDefinition | undefined {
  return bundledScenarioProfiles.find((profile) => profile.id === id);
}

export function parseScenarioDefinition(value: unknown): ScenarioDefinition {
  if (!isRecord(value)) {
    throw new Error("Scenario definition must be a JSON object.");
  }

  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const assistantRole = readRequiredString(value, "assistantRole");
  const business = parseBusinessContext(value.business);
  const personaSource = parsePersonaSource(value.personaSource);
  const toolInventory = parseToolInventory(value.toolInventory);
  const conversationGoals = readRequiredStringArray(value, "conversationGoals");
  const stoppingRules = parseStoppingRules(value.stoppingRules);
  const scenario: ScenarioDefinition = {
    id,
    name,
    assistantRole,
    business,
    personaSource,
    toolInventory,
    conversationGoals,
    stoppingRules,
  };

  if (typeof value.systemPrompt === "string") {
    scenario.systemPrompt = value.systemPrompt;
  }

  if (isJsonObject(value.metadata)) {
    scenario.metadata = value.metadata;
  }

  return scenario;
}

export function parseScenarioDefinitionJson(contents: string): ScenarioDefinition {
  return parseScenarioDefinition(JSON.parse(contents) as unknown);
}

function parseBusinessContext(value: unknown): BusinessContext {
  if (!isRecord(value)) {
    throw new Error("Scenario business must be a JSON object.");
  }

  const business: BusinessContext = {
    id: readRequiredString(value, "id"),
    name: readRequiredString(value, "name"),
    domain: readRequiredString(value, "domain"),
  };

  if (typeof value.description === "string") {
    business.description = value.description;
  }

  if (typeof value.locale === "string") {
    business.locale = value.locale;
  }

  if (isJsonObject(value.attributes)) {
    business.attributes = value.attributes;
  }

  return business;
}

function parsePersonaSource(value: unknown): ScenarioDefinition["personaSource"] {
  if (!isRecord(value)) {
    throw new Error("Scenario personaSource must be a JSON object.");
  }

  if (typeof value.count !== "number" || !Number.isInteger(value.count) || value.count < 0) {
    throw new Error("Scenario personaSource.count must be a non-negative integer.");
  }

  const personaSource: ScenarioDefinition["personaSource"] = {
    count: value.count,
  };

  if (typeof value.generatorPrompt === "string") {
    personaSource.generatorPrompt = value.generatorPrompt;
  }

  if (typeof value.source === "string") {
    personaSource.source = value.source;
  }

  if (Array.isArray(value.personas)) {
    personaSource.personas = value.personas.map(parsePersonaDefinition);
  }

  return personaSource;
}

function parsePersonaDefinition(value: unknown): PersonaDefinition {
  if (!isRecord(value)) {
    throw new Error("Persona entries must be JSON objects.");
  }

  const persona: PersonaDefinition = {
    id: readRequiredString(value, "id"),
    label: readRequiredString(value, "label"),
    goals: readRequiredStringArray(value, "goals"),
  };

  if (Array.isArray(value.traits)) {
    persona.traits = value.traits.map((trait) => {
      if (typeof trait !== "string") {
        throw new Error("Persona traits must be strings.");
      }
      return trait;
    });
  }

  if (typeof value.locale === "string") {
    persona.locale = value.locale;
  }

  if (isJsonObject(value.metadata)) {
    persona.metadata = value.metadata;
  }

  return persona;
}

function parseToolInventory(value: unknown): ScenarioDefinition["toolInventory"] {
  if (!isRecord(value)) {
    throw new Error("Scenario toolInventory must be a JSON object.");
  }

  if (!Array.isArray(value.tools)) {
    throw new Error("Scenario toolInventory.tools must be an array.");
  }

  const toolInventory: ScenarioDefinition["toolInventory"] = {
    tools: value.tools.map(parseToolSchema),
  };

  if (typeof value.source === "string") {
    toolInventory.source = value.source;
  }

  return toolInventory;
}

function parseToolSchema(value: unknown): ToolSchema {
  if (!isRecord(value)) {
    throw new Error("Tool entries must be JSON objects.");
  }

  return {
    name: readRequiredString(value, "name"),
    description: readRequiredString(value, "description"),
    parameters: parseJsonSchemaObject(value.parameters),
  };
}

function parseJsonSchemaObject(value: unknown): JsonSchemaObject {
  if (!isRecord(value) || value.type !== "object" || !isRecord(value.properties)) {
    throw new Error("Tool parameters must be an object JSON schema.");
  }

  const parameters: JsonSchemaObject = {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(value.properties).map(([key, schemaValue]) => [key, parseJsonSchemaValue(schemaValue)]),
    ),
  };

  if (Array.isArray(value.required)) {
    parameters.required = value.required.map((entry) => {
      if (typeof entry !== "string") {
        throw new Error("JSON schema required entries must be strings.");
      }
      return entry;
    });
  }

  if (typeof value.additionalProperties === "boolean") {
    parameters.additionalProperties = value.additionalProperties;
  }

  if (typeof value.description === "string") {
    parameters.description = value.description;
  }

  return parameters;
}

function parseJsonSchemaValue(value: unknown): JsonSchemaValue {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("JSON schema values must be objects with a type.");
  }

  if (value.type === "object") {
    return parseJsonSchemaObject(value);
  }

  if (!["string", "number", "integer", "boolean", "array", "null"].includes(value.type)) {
    throw new Error(`Unsupported JSON schema type: ${value.type}`);
  }

  const schemaType = value.type as "string" | "number" | "integer" | "boolean" | "array" | "null";
  const schemaValue: Exclude<JsonSchemaValue, JsonSchemaObject> = { type: schemaType };

  if (typeof value.description === "string") {
    schemaValue.description = value.description;
  }

  if (Array.isArray(value.enum)) {
    schemaValue.enum = value.enum.map((entry) => {
      if (!isJsonPrimitive(entry)) {
        throw new Error("JSON schema enum entries must be primitive values.");
      }
      return entry;
    });
  }

  if (value.type === "array" && value.items !== undefined) {
    schemaValue.items = parseJsonSchemaValue(value.items);
  }

  return schemaValue;
}

function parseStoppingRules(value: unknown): ScenarioDefinition["stoppingRules"] {
  if (!isRecord(value)) {
    throw new Error("Scenario stoppingRules must be a JSON object.");
  }

  const stoppingRules: ScenarioDefinition["stoppingRules"] = {};

  if (typeof value.maxTurns === "number" && Number.isInteger(value.maxTurns) && value.maxTurns > 0) {
    stoppingRules.maxTurns = value.maxTurns;
  }

  if (Array.isArray(value.stopWhen)) {
    stoppingRules.stopWhen = readStringArray(value.stopWhen, "stoppingRules.stopWhen");
  }

  if (Array.isArray(value.escalationCriteria)) {
    stoppingRules.escalationCriteria = readStringArray(value.escalationCriteria, "stoppingRules.escalationCriteria");
  }

  return stoppingRules;
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== "string" || value[key].length === 0) {
    throw new Error(`Scenario ${key} must be a non-empty string.`);
  }

  return value[key];
}

function readRequiredStringArray(value: Record<string, unknown>, key: string): string[] {
  if (!Array.isArray(value[key])) {
    throw new Error(`Scenario ${key} must be an array of strings.`);
  }

  return readStringArray(value[key], key);
}

function readStringArray(value: unknown[], key: string): string[] {
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`Scenario ${key} entries must be non-empty strings.`);
    }

    return entry;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  return isJsonPrimitive(value) || (Array.isArray(value) && value.every(isJsonValue)) || isJsonObject(value);
}

function isJsonPrimitive(value: unknown): value is null | string | number | boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}
