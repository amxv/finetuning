import {
  buildDeterministicPersonas,
  createDeterministicPersonaGenerator,
  createModelBackedPersonaGenerator,
  loadScenarioSource,
  ProviderResponseError,
  retailSupportScenarioProfile,
} from "../dist/index.js";

const scenario = await loadScenarioSource(retailSupportScenarioProfile);

await assertDeterministicParity();
await assertValidFakeModelGeneration();
await assertInvalidJsonRetriesOnce();
await assertInvalidPersonaShapeFailsAfterRetry();

console.log("Verified deterministic and model-backed persona generation, repair retry, and shape validation.");

async function assertDeterministicParity() {
  const direct = buildDeterministicPersonas(scenario, 3);
  const generated = await createDeterministicPersonaGenerator().generate({ scenario, count: 3 });

  if (JSON.stringify(generated) !== JSON.stringify(direct)) {
    throw new Error("Deterministic PersonaGenerator did not match buildDeterministicPersonas output.");
  }

  if (generated[0]?.id !== "persona-product-comparison" || generated[2]?.id !== "sample-retail-support-persona-3") {
    throw new Error(`Deterministic personas did not preserve expected ids: ${JSON.stringify(generated)}`);
  }

  if (generated[2]?.metadata?.generated !== true || generated[2]?.metadata?.scenarioId !== "sample-retail-support") {
    throw new Error(`Deterministic generated persona metadata was missing: ${JSON.stringify(generated[2])}`);
  }
}

async function assertValidFakeModelGeneration() {
  const calls = [];
  const generator = createModelBackedPersonaGenerator({
    provider: "openai",
    model: "fake-persona-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        return {
          kind: "text",
          content: JSON.stringify([
            {
              id: "weekend-hiker",
              label: "Weekend hiker",
              goals: ["Compare day packs for a weekend hike."],
              traits: ["budget-conscious"],
              metadata: { source: "fake-model" },
            },
          ]),
        };
      },
    },
  });

  const personas = await generator.generate({ scenario, count: 1 });

  if (calls.length !== 1) {
    throw new Error(`Valid model output should not retry; saw ${calls.length} calls.`);
  }

  const persona = personas[0];
  if (
    persona?.id !== "weekend-hiker" ||
    persona.locale !== "en-US" ||
    persona.metadata?.generated !== true ||
    persona.metadata?.scenarioId !== "sample-retail-support" ||
    persona.metadata?.personaProvider !== "openai" ||
    persona.metadata?.personaModel !== "fake-persona-model" ||
    persona.metadata?.source !== "fake-model"
  ) {
    throw new Error(`Model persona output or metadata was not normalized correctly: ${JSON.stringify(persona)}`);
  }

  if (calls[0]?.metadata?.requestPath !== "persona-generation") {
    throw new Error(`Initial model request did not include persona generation metadata: ${JSON.stringify(calls[0])}`);
  }
}

async function assertInvalidJsonRetriesOnce() {
  const calls = [];
  const generator = createModelBackedPersonaGenerator({
    provider: "anthropic",
    model: "fake-repair-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        if (calls.length === 1) {
          return { kind: "text", content: "{not valid json" };
        }

        return {
          kind: "text",
          content: JSON.stringify([
            {
              id: "return-checker",
              label: "Return checker",
              goals: ["Ask if a jacket can be returned."],
              locale: "en-CA",
            },
          ]),
        };
      },
    },
  });

  const personas = await generator.generate({ scenario, count: 1 });

  if (calls.length !== 2) {
    throw new Error(`Invalid JSON should retry exactly once; saw ${calls.length} calls.`);
  }

  if (calls[1]?.metadata?.requestPath !== "persona-generation-repair") {
    throw new Error(`Repair request metadata was missing: ${JSON.stringify(calls[1])}`);
  }

  if (!calls[1]?.messages?.[1]?.content.includes("Validation error: response was not valid JSON")) {
    throw new Error(`Repair prompt did not include the validation error: ${JSON.stringify(calls[1])}`);
  }

  if (
    personas[0]?.id !== "return-checker" ||
    personas[0]?.metadata?.personaProvider !== "anthropic" ||
    personas[0]?.metadata?.personaModel !== "fake-repair-model"
  ) {
    throw new Error(`Repaired persona was not returned with metadata: ${JSON.stringify(personas)}`);
  }
}

async function assertInvalidPersonaShapeFailsAfterRetry() {
  const calls = [];
  const generator = createModelBackedPersonaGenerator({
    provider: "openai",
    model: "fake-invalid-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        return { kind: "text", content: JSON.stringify([{ id: "missing-goals", label: "Missing goals" }]) };
      },
    },
  });

  try {
    await generator.generate({ scenario, count: 1 });
  } catch (error) {
    if (
      error instanceof ProviderResponseError &&
      error.message.includes("Invalid persona generation response after repair") &&
      calls.length === 2
    ) {
      return;
    }

    throw error;
  }

  throw new Error("Invalid persona shape did not fail after one retry.");
}
