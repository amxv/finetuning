/** Stable generation namespace backed by the current simulation compatibility layer. */
export type {
  ModelBackedPersonaGeneratorOptions,
  ModelBackedSimulationRunnerOptions,
  PersonaGenerationRequest,
  PersonaGenerator,
  SimulationRequest,
  SimulationRunner,
} from "../simulation/index.js";
export {
  createDeterministicPersonaGenerator,
  createDeterministicSimulationRunner,
  createModelBackedPersonaGenerator,
  createModelBackedSimulationRunner,
} from "../simulation/index.js";
