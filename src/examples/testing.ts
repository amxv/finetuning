/**
 * Compatibility fixtures intended for examples and tests.
 *
 * Production consumers should prefer the semantic contracts exported from
 * `@amxv/finetuning/core` and avoid depending on these fixed sample values.
 */
export {
  bookAppointmentTool,
  bookAppointmentToolTrajectoryFixture,
  checkAvailabilityTool,
  checkAvailabilityToolTrajectoryFixture,
  fullToolTrajectoryConversationFixture,
  noToolConversationFixture,
  representativeTrajectories,
  searchTool,
  searchToolTrajectoryFixture,
  toolDecisionConversationFixture,
  toolTrajectoryFixtures,
} from "../core/fixtures.js";
