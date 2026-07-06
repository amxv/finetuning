import type { ConversationTrajectory, ToolSchema } from "./model.js";

const appointmentTool: ToolSchema = {
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
};

export const noToolConversationFixture: ConversationTrajectory = {
  id: "fixture-no-tool",
  business: {
    id: "business-demo-clinic",
    name: "Demo Clinic",
    domain: "healthcare",
    locale: "en-US",
  },
  persona: {
    id: "persona-general-question",
    label: "General information seeker",
    goals: ["Ask whether the clinic accepts new patients."],
  },
  messages: [
    { kind: "system", content: "You are a helpful front-desk assistant for Demo Clinic." },
    { kind: "user", content: "Are you accepting new patients?" },
    { kind: "assistant_text", content: "Yes, Demo Clinic is accepting new patients this month." },
  ],
};

export const toolDecisionConversationFixture: ConversationTrajectory = {
  id: "fixture-tool-decision",
  business: {
    id: "business-demo-clinic",
    name: "Demo Clinic",
    domain: "healthcare",
    locale: "en-US",
  },
  persona: {
    id: "persona-scheduler",
    label: "Appointment scheduler",
    goals: ["Find an appointment for a cleaning."],
  },
  tools: [appointmentTool],
  messages: [
    { kind: "system", content: "Use tools when appointment availability is needed." },
    { kind: "user", content: "Can I book a cleaning tomorrow?" },
    {
      kind: "assistant_tool_call",
      toolCalls: [
        {
          id: "call_availability_1",
          name: "check_availability",
          arguments: {
            service: "cleaning",
            preferredDate: "tomorrow",
          },
        },
      ],
    },
  ],
};

export const fullToolTrajectoryConversationFixture: ConversationTrajectory = {
  ...toolDecisionConversationFixture,
  id: "fixture-full-tool-trajectory",
  messages: [
    ...toolDecisionConversationFixture.messages,
    {
      kind: "tool_result",
      result: {
        toolCallId: "call_availability_1",
        name: "check_availability",
        result: {
          available: true,
          slots: ["2026-07-07T15:00:00-04:00", "2026-07-07T16:30:00-04:00"],
        },
      },
    },
    {
      kind: "assistant_text",
      content: "I found openings tomorrow at 3:00 PM and 4:30 PM. Which one works for you?",
    },
  ],
};

export const representativeTrajectories = [
  noToolConversationFixture,
  toolDecisionConversationFixture,
  fullToolTrajectoryConversationFixture,
];
