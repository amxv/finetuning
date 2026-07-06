import type { ConversationTrajectory, ToolSchema } from "./model.js";
import { receptionistScenarioProfile } from "./scenarios.js";

const receptionistPersonas = receptionistScenarioProfile.personaSource.personas ?? [];

export const searchTool = getScenarioTool("search");

export const bookAppointmentTool = getScenarioTool("book_appointment");

export const checkAvailabilityTool = getScenarioTool("check_availability");

export const noToolConversationFixture: ConversationTrajectory = {
  id: "fixture-no-tool",
  business: receptionistScenarioProfile.business,
  persona: getScenarioPersona("persona-general-question"),
  messages: [
    { kind: "system", content: receptionistScenarioProfile.systemPrompt ?? "" },
    { kind: "user", content: "Are you accepting new patients?" },
    { kind: "assistant_text", content: "Yes, Demo Clinic is accepting new patients this month." },
  ],
};

export const searchToolTrajectoryFixture: ConversationTrajectory = {
  id: "fixture-tool-search",
  business: receptionistScenarioProfile.business,
  persona: getScenarioPersona("persona-hours-question"),
  tools: [searchTool],
  messages: [
    { kind: "system", content: "Use search when answering factual business questions." },
    { kind: "user", content: "What are your Saturday hours?" },
    {
      kind: "assistant_tool_call",
      toolCalls: [
        {
          id: "call_search_1",
          name: "search",
          arguments: {
            query: "Demo Clinic Saturday hours",
          },
        },
      ],
    },
    {
      kind: "tool_result",
      result: {
        toolCallId: "call_search_1",
        name: "search",
        payloadFormat: "normalized_json",
        result: {
          answer: "Saturday hours are 9:00 AM to 1:00 PM.",
          confidence: 0.98,
          sources: ["business_profile.hours"],
        },
      },
    },
    {
      kind: "assistant_text",
      content: "Demo Clinic is open on Saturday from 9:00 AM to 1:00 PM.",
    },
  ],
};

export const checkAvailabilityToolTrajectoryFixture: ConversationTrajectory = {
  id: "fixture-tool-check-availability",
  business: receptionistScenarioProfile.business,
  persona: getScenarioPersona("persona-scheduler"),
  tools: [checkAvailabilityTool],
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
            preferredDate: "tomorrow",
            service: "cleaning",
          },
        },
      ],
    },
    {
      kind: "tool_result",
      result: {
        toolCallId: "call_availability_1",
        name: "check_availability",
        payloadFormat: "normalized_json",
        result: {
          available: true,
          slots: [
            {
              id: "slot_2026_07_07_1500",
              startsAt: "2026-07-07T15:00:00-04:00",
            },
            {
              id: "slot_2026_07_07_1630",
              startsAt: "2026-07-07T16:30:00-04:00",
            },
          ],
        },
      },
    },
    {
      kind: "assistant_text",
      content: "I found openings tomorrow at 3:00 PM and 4:30 PM. Which one works for you?",
    },
  ],
};

export const bookAppointmentToolTrajectoryFixture: ConversationTrajectory = {
  id: "fixture-tool-book-appointment",
  business: receptionistScenarioProfile.business,
  persona: getScenarioPersona("persona-booker"),
  tools: [bookAppointmentTool],
  messages: [
    { kind: "system", content: "Use tools to book confirmed appointment requests." },
    { kind: "user", content: "Please book the 3 PM cleaning for Jordan Lee." },
    {
      kind: "assistant_tool_call",
      toolCalls: [
        {
          id: "call_booking_1",
          name: "book_appointment",
          arguments: {
            service: "cleaning",
            slotId: "slot_2026_07_07_1500",
            visitorName: "Jordan Lee",
          },
        },
      ],
    },
    {
      kind: "tool_result",
      result: {
        toolCallId: "call_booking_1",
        name: "book_appointment",
        payloadFormat: "normalized_json",
        result: {
          appointmentId: "appt_demo_1001",
          confirmed: true,
          service: "cleaning",
          startsAt: "2026-07-07T15:00:00-04:00",
          visitorName: "Jordan Lee",
        },
      },
    },
    {
      kind: "assistant_text",
      content: "You are booked for a cleaning tomorrow at 3:00 PM. Your confirmation number is appt_demo_1001.",
    },
  ],
};

export const toolDecisionConversationFixture: ConversationTrajectory = {
  ...checkAvailabilityToolTrajectoryFixture,
  id: "fixture-tool-decision",
  messages: checkAvailabilityToolTrajectoryFixture.messages.slice(0, 3),
};

export const fullToolTrajectoryConversationFixture = checkAvailabilityToolTrajectoryFixture;

export const toolTrajectoryFixtures = [
  searchToolTrajectoryFixture,
  bookAppointmentToolTrajectoryFixture,
  checkAvailabilityToolTrajectoryFixture,
];

export const representativeTrajectories = [
  noToolConversationFixture,
  toolDecisionConversationFixture,
  ...toolTrajectoryFixtures,
];

function getScenarioTool(name: string): ToolSchema {
  const tool = receptionistScenarioProfile.toolInventory.tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Missing receptionist sample tool: ${name}`);
  }

  return tool;
}

function getScenarioPersona(id: string) {
  const persona = receptionistPersonas.find((candidate) => candidate.id === id);
  if (!persona) {
    throw new Error(`Missing receptionist sample persona: ${id}`);
  }

  return persona;
}
