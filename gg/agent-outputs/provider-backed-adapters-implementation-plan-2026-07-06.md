# Provider-Backed Adapters Implementation Plan

## State of Current System

The standalone toolkit has the right public boundaries for provider-backed work, but the implementation is still deterministic and mostly adapter-shaped rather than provider-backed.

Current architecture and data flow:

- `src/core/model.ts` owns provider-neutral domain types: `ScenarioDefinition`, `PersonaDefinition`, `ToolSchema`, `ToolCall`, `ToolResult`, `ConversationMessage`, `ConversationTrajectory`, `SimulatedAssistantTurn`, and `FineTuningToolkitConfig`.
- `src/core/openai.ts` converts provider-neutral `ConversationTrajectory` objects into OpenAI chat fine-tuning rows. It already supports `plain_chat`, `tool_decision`, and `full_tool_trajectory`, with stable JSON serialization for tool arguments and tool results.
- `src/core/validation.ts` and `src/core/dataset.ts` validate OpenAI JSONL rows, count messages/tool calls/tool results, require tool results to reference earlier tool-call ids, and summarize language counts from metadata.
- `src/core/scenarios.ts` contains bundled sample scenario profiles and parser helpers. `examples/receptionist/scenario.json` and `examples/retail-support/scenario.json` prove the scenario shape is not receptionist-only.
- `src/providers/index.ts` defines `ModelClient`, `ProviderAdapter`, `ProviderClientOptions`, `ModelInvocationRequest`, and `ModelInvocationResponse`, but `openAIProviderAdapter` and `anthropicProviderAdapter` are currently unconfigured placeholders that throw.
- `src/simulation/index.ts` defines `SimulationRuntimeAdapters`, `SimulationRunner`, `AssistantTurnSimulator`, filesystem/persistence boundaries, and `loadScenarioSource`, but `createDeferredSimulationRunner()` still throws and no model-backed runner exists.
- `src/translation/index.ts` defines a provider-aware `TranslationTextAdapter` boundary and schema-preserving translation rules, but the built-in working path is only `local-pseudo`; provider-backed translation is not implemented.
- `src/cli/index.ts` owns the only concrete workflows. `generate-personas` builds deterministic personas from bundled/personaSource data. `simulate-dataset` directly calls `buildDeterministicTrajectories()` inside the CLI, fabricating one user message, one tool call/result/final response per row. `translate-dataset` rejects any strategy except `local-pseudo`.
- `src/index.ts` exports the adapter contracts and workflow manifests, so the next pass can add concrete adapters without moving public core APIs.
- `scripts/verify-fixtures.mjs`, `scripts/verify-cli.mjs`, `scripts/verify-translation.mjs`, and `scripts/verify-readme-workflow.mjs` are the current executable safety net. They validate full tool-trajectory shape, CLI workflows, translation preservation, scenario loading, and the no-Cloudflare/Hono/D1/core-boundary rule.
- `package.json` has only TypeScript and Node types as dev dependencies. There are no provider SDK dependencies yet.

Important current limitations:

- Provider selection exists in types but is not wired to runtime config, CLI flags, environment variables, or SDK clients.
- Persona generation is deterministic fill-in logic, not model-generated.
- Conversation simulation is deterministic CLI-local logic, not reusable `src/simulation` behavior.
- Tool execution during simulation is synthetic and hard-coded in the CLI, not a configurable tool-result adapter.
- Translation only prefixes text through `local-pseudo`; real provider calls are unavailable.
- Provider errors, missing API keys, unsupported model/tool combinations, rate limits, malformed tool-call responses, and invalid translation output are not modeled.
- Docs accurately say provider-backed simulation/translation are adapter-boundary work, so docs must change when concrete providers land.
- Real-log conversion is explicitly deferred and has no direct dependency for this pass.

## State of Ideal System

The ideal next-pass system keeps the current standalone repo shape while making generation and translation genuinely usable with real model providers.

The ideal system should:

- Keep `src/core` provider-neutral and free of Cloudflare Workers, Hono, D1, queues, Bun-only APIs, provider SDKs, filesystem implementations, and generated outputs.
- Add concrete OpenAI and Anthropic provider adapters behind `src/providers` contracts.
- Support explicit provider config through CLI flags, config files, environment variables, and library APIs without committing secrets or requiring global state.
- Use model-backed persona generation when requested, while preserving deterministic sample generation as the default/offline fallback.
- Use model-backed conversation simulation through a reusable `SimulationRunner`, not CLI-local trajectory fabrication.
- Support full tool trajectories from real model tool-call decisions: model emits assistant text or tool calls, local tool-result adapters execute or synthesize tool results, and the model produces a final assistant response after tool results.
- Add real provider-backed translation implementations behind `TranslationTextAdapter`, preserving the existing schema rules for system/user/assistant text, tool calls, tool result messages, tool definitions, and metadata.
- Provide strong validation around provider outputs before writing datasets: parse tool arguments, verify tool names exist in scenario tools, verify translated rows still validate, and surface actionable provider/config errors.
- Keep OpenAI chat fine-tuning JSONL as the canonical export format, regardless of which provider generated the synthetic data.
- Keep log-derived conversion deferred unless an implementer finds an unavoidable shared config/helper dependency.

## Cross-provider Requirements

- Provider identity must be explicit in config, CLI output, row metadata, translation metadata, and errors. Do not hide one provider behind another provider's name.
- Support provider kinds currently modeled by the repo: `openai`, `anthropic`, and `custom`. The implementation pass should add concrete OpenAI and Anthropic adapters; `custom` remains an injectable library adapter.
- Keep the internal request/response contract provider-neutral:
  - `ModelInvocationRequest.messages` stays in the repo's `system/user/assistant/tool` shape.
  - `ModelInvocationRequest.tools` stays in the repo's `ToolSchema` shape.
  - `ModelInvocationResponse` stays as `text` or `tool_calls`.
- Add provider-specific mappers in `src/providers`, not `src/core`.
  - OpenAI mapper: internal messages/tools to the current official OpenAI Node SDK request shape; provider responses back to `ModelInvocationResponse`.
  - Anthropic mapper: internal messages/tools to the current official Anthropic TypeScript SDK Messages request shape; provider responses back to `ModelInvocationResponse`.
- Before implementation, verify current SDK APIs from official docs. A quick reconnaissance on 2026-07-06 showed OpenAI's official docs emphasize the Node SDK `responses.create` API for text/tool use and structured outputs, while Anthropic's official docs point TypeScript users to `@anthropic-ai/sdk` and `client.messages.create`. Implementers must use official docs at implementation time rather than stale remembered snippets.
- Provider config must support:
  - `provider`
  - `model`
  - `apiKeyEnv`
  - optional `baseUrl`
  - optional `temperature`
  - optional `maxOutputTokens`
  - optional provider-specific metadata/headers
- API keys must be read from environment variables at runtime; config files should store env var names, not secret values.
- Provider adapters must normalize:
  - authentication/missing-key failures
  - HTTP/network failures
  - rate-limit/retryable failures
  - unsupported tool-use responses
  - malformed JSON tool arguments
  - empty text completions
  - safety/refusal/blocked responses where detectable
- Tool schema conversion must preserve function names, descriptions, object parameters, required fields, enum values, array items, and `additionalProperties`.
- Translation providers must return only translated text for a single requested field. If a provider returns surrounding JSON/markdown/explanatory text, the adapter must either strip only with a defensible parser or fail loudly.
- Generated row metadata should record at least:
  - `scenarioId`
  - `personaId`
  - `locale`
  - `generatedBy`
  - `simulationProvider`
  - `simulationModel`
  - `personaProvider` when model-generated personas are used
  - `translationProvider` and `translationRequestPath` for translated rows
- Provider-backed flows must remain optional. Offline sample workflows in README and verification scripts should still run without API keys.

## Plan Phases

### Phase 1: Provider Config, Auth, And Error Foundation

#### Files to read before starting

- `src/core/model.ts`
- `src/providers/index.ts`
- `src/simulation/index.ts`
- `src/translation/index.ts`
- `src/index.ts`
- `src/cli/index.ts`
- `package.json`
- `CONTRIBUTING.md`
- official OpenAI Node SDK docs for current Responses/tool calling APIs
- official Anthropic TypeScript SDK docs for current Messages/tool use APIs

#### What to do

- Extend the provider config model without breaking existing scenario configs:
  - Add a `ProviderRuntimeConfig` or equivalent type under `src/providers`.
  - Include `provider`, `model`, `apiKeyEnv`, `baseUrl`, `temperature`, `maxOutputTokens`, optional headers, and metadata.
  - Keep existing `FineTuningToolkitConfig.providers` usable, but allow richer provider config where needed.
- Add environment resolution helpers in `src/providers`, not `src/core`:
  - `resolveProviderClientOptions(config, env = process.env)` or a pure helper that accepts an env map.
  - Fail with clear messages such as `Missing OPENAI_API_KEY for openai provider`.
  - Do not read `process.env` in `src/core`.
- Add normalized provider errors:
  - `ProviderConfigurationError`
  - `ProviderAuthenticationError`
  - `ProviderRateLimitError`
  - `ProviderResponseError`
  - `ProviderToolCallError`
  - `ProviderUnsupportedFeatureError`
- Add CLI parsing for provider options but keep deterministic defaults:
  - `simulate-dataset --simulation-provider openai|anthropic|deterministic`
  - `--simulation-model <model>`
  - `--simulation-api-key-env <ENV_NAME>`
  - `generate-personas --persona-provider openai|anthropic|deterministic`
  - `translate-dataset --strategy local-pseudo|openai|anthropic`
  - `--translation-model <model>`
  - `--translation-api-key-env <ENV_NAME>`
- Keep provider-backed commands gated by explicit provider flags. Running current README commands must still require no secrets.
- Add dependency decisions in `package.json`:
  - `openai` for OpenAI adapter.
  - `@anthropic-ai/sdk` for Anthropic adapter.
  - Avoid adding broader orchestration frameworks unless a concrete gap appears.
- Update public exports in `src/index.ts` for new config/error helpers.

#### Validation strategy

- Add a focused script such as `scripts/verify-provider-config.mjs` that builds the package and verifies:
  - missing API key env var produces a clear config error
  - explicit API key env resolves into `ProviderClientOptions`
  - deterministic CLI flows still work without provider flags
  - unsupported provider names are rejected before any SDK call
- Run:
  - `npm run typecheck`
  - `npm run verify`
  - the new provider-config verification script, or add it to `npm run verify`

#### Risks / fallbacks

- Risk: config shape churn breaks existing example scenario JSON.
- Fallback: keep scenario config untouched and introduce provider runtime config as a CLI/library option layered on top of scenario definitions.
- Risk: SDK APIs differ from assumptions.
- Fallback: pin versions after checking official docs and wrap provider-specific details inside mapper modules so callers only see the stable internal contract.

### Phase 2: Concrete Provider Adapters

#### Files to read before starting

- `src/providers/index.ts`
- `src/core/model.ts`
- `src/core/openai.ts`
- `src/core/validation.ts`
- `src/core/fixtures.ts`
- `scripts/verify-fixtures.mjs`
- `package.json`
- official OpenAI tool/function calling docs
- official Anthropic tool use docs

#### What to do

- Split provider code into focused modules:
  - `src/providers/index.ts` for exports and shared contracts.
  - `src/providers/errors.ts` for normalized errors.
  - `src/providers/config.ts` for runtime config/env resolution.
  - `src/providers/openai.ts` for OpenAI SDK adapter.
  - `src/providers/anthropic.ts` for Anthropic SDK adapter.
  - `src/providers/mappers.ts` or provider-specific mapper files for message/tool conversion.
- Replace `createUnconfiguredProviderAdapter("openai")` and `createUnconfiguredProviderAdapter("anthropic")` exports with real adapters.
- Implement OpenAI adapter:
  - Create official SDK client from resolved options.
  - Convert internal messages/tools into the current OpenAI request format.
  - Convert model text responses to `{ kind: "text" }`.
  - Convert tool-call responses to `{ kind: "tool_calls", toolCalls }`.
  - Parse tool-call argument strings as JSON objects and fail with `ProviderToolCallError` on invalid JSON.
  - Capture useful metadata such as provider response id, model, finish reason/status, and token usage where available.
- Implement Anthropic adapter:
  - Create official SDK client from resolved options.
  - Convert internal messages/tools into Anthropic Messages request format.
  - Map Anthropic `tool_use` blocks to internal `ToolCall` objects.
  - Map text blocks to `{ kind: "text" }`.
  - Preserve mixed text-plus-tool-call content when the provider returns both.
  - Capture model/stop reason/usage metadata where available.
- Add a provider factory:
  - `createProviderAdapter(kind)`
  - `createModelClientFromConfig(config, env?)`
- Keep `custom` as an injectable adapter path, not a built-in HTTP client.
- Do not add provider imports outside `src/providers`.

#### Validation strategy

- Unit-style verification with fake SDK transports if the SDKs allow it, or by mocking adapter internals through injected clients:
  - OpenAI text response maps to internal text response.
  - OpenAI tool call maps to internal `ToolCall`.
  - OpenAI malformed tool arguments fail.
  - Anthropic text block maps to internal text response.
  - Anthropic tool_use block maps to internal `ToolCall`.
  - Anthropic malformed input/tool-use shape fails.
- Boundary verification:
  - Search `src/core` for `openai`, `anthropic`, provider SDK import names, `process.env`, Cloudflare/Hono/D1/queue terms.
  - Existing `scripts/verify-fixtures.mjs` core-boundary check should remain passing; expand forbidden terms if needed.
- Optional live smoke tests should be opt-in and skipped without API keys:
  - `scripts/smoke-openai-provider.mjs`
  - `scripts/smoke-anthropic-provider.mjs`
  - Keep them outside default `npm run verify` unless they detect env vars and skip cleanly.

#### Risks / fallbacks

- Risk: provider SDKs are hard to mock.
- Fallback: isolate request/response mapping into pure functions and test those with captured representative payloads; keep live SDK smoke tests opt-in.
- Risk: OpenAI Responses API and chat fine-tuning row format differ.
- Fallback: keep provider invocation mapping separate from `src/core/openai.ts`; the canonical export remains OpenAI fine-tuning JSONL and does not dictate the generation API used.
- Risk: Anthropic tool use supports content blocks that do not map 1:1 to OpenAI-style messages.
- Fallback: normalize into the existing `ModelInvocationResponse` union and record provider-specific leftovers in metadata.

### Phase 3: Model-Backed Persona Generation

#### Files to read before starting

- `src/core/model.ts`
- `src/core/scenarios.ts`
- `src/simulation/index.ts`
- `src/providers/index.ts`
- `src/cli/index.ts`
- `examples/receptionist/scenario.json`
- `examples/retail-support/scenario.json`
- `scripts/verify-cli.mjs`
- `scripts/verify-readme-workflow.mjs`

#### What to do

- Move persona generation out of CLI-local `buildPersonas()` into `src/simulation`.
- Add a `PersonaGenerator` contract:
  - deterministic implementation that preserves current behavior.
  - model-backed implementation using `ModelClient`.
- Define a strict expected model output shape for personas:
  - array of `PersonaDefinition`
  - each persona must have `id`, `label`, non-empty `goals`
  - optional `traits`, `locale`, `metadata`
- For OpenAI, prefer a structured-output or tool/function-response approach if supported by the verified current SDK; otherwise prompt for JSON and validate.
- For Anthropic, prompt for JSON or use the provider's current tool/structured-output pattern if supported; always validate after generation.
- Add repair policy:
  - one retry with a concise validation-error prompt if JSON parse or persona validation fails.
  - after retry, fail clearly rather than silently fabricating model output.
- Add CLI behavior:
  - default remains deterministic.
  - provider-backed persona generation requires explicit `--persona-provider` and model/env options or config.
  - output format remains the current persona JSON array.
- Add metadata to generated personas:
  - `generated: true`
  - `scenarioId`
  - `personaProvider`
  - `personaModel`

#### Validation strategy

- Pure tests/verification:
  - deterministic generator matches current output for bundled scenarios.
  - model-backed generator can be tested with fake `ModelClient` returning valid JSON.
  - invalid JSON triggers retry.
  - invalid persona shape fails after retry.
  - generated persona ids are stable enough for downstream trajectory ids, or collision-handled deterministically.
- CLI verification:
  - current `generate-personas` command remains passing without provider flags.
  - fake/injected model path is covered at library level.
  - live smoke script can run with real provider env vars but must skip when absent.

#### Risks / fallbacks

- Risk: provider output drifts from expected JSON.
- Fallback: use function/tool/structured-output constraints where provider supports them, plus runtime validation and one repair retry.
- Risk: persona generation becomes nondeterministic and breaks docs.
- Fallback: keep README sample workflows deterministic and document model-backed generation as an explicit advanced path.

### Phase 4: Model-Backed Conversation Simulation Runner

#### Files to read before starting

- `src/simulation/index.ts`
- `src/providers/index.ts`
- `src/core/model.ts`
- `src/core/openai.ts`
- `src/core/validation.ts`
- `src/core/fixtures.ts`
- `src/cli/index.ts`
- `scripts/verify-fixtures.mjs`
- `scripts/verify-cli.mjs`
- `docs/full-tool-trajectory-tutorial.md`

#### What to do

- Replace deferred-only simulation with concrete runners in `src/simulation`:
  - `createDeterministicSimulationRunner()` preserving current CLI behavior.
  - `createModelBackedSimulationRunner()` using `ModelClient`.
- Move CLI-local `buildDeterministicTrajectories()`, `buildToolArguments()`, and sample-value helpers into deterministic simulation modules.
- Add reusable prompt builders for:
  - initial assistant simulation request from scenario + persona + trajectory history.
  - final assistant response request after tool results.
  - optional visitor/user turn generation if the pass includes multi-turn conversation simulation beyond the current one-turn sample.
- Start with an executable minimal real-provider flow:
  - system message from scenario.
  - user message from persona goal.
  - ask model to answer or choose a tool using scenario `toolInventory`.
  - if text response: emit `assistant_text`.
  - if tool calls: emit `assistant_tool_call`, execute tool-result adapter, then ask model for final assistant response and emit `assistant_text`.
- Add a `ToolResultProvider` or `ToolExecutionAdapter` contract:
  - deterministic default for sample scenarios.
  - caller-injected custom implementation for real tool result payloads.
  - no Cloudflare/backend tool runtime imports.
- Validate provider tool calls before accepting them:
  - tool name must exist in scenario tools.
  - arguments must be a JSON object.
  - optionally validate required fields and primitive types against the scenario JSON schema.
- Preserve export modes:
  - `plain_chat` can ask the model without tools or filter tool messages as today.
  - `tool_decision` stops after accepted assistant tool call.
  - `full_tool_trajectory` continues through tool result and final assistant response.
- Add row metadata for model-backed flows:
  - provider/model
  - export mode
  - simulation path
  - whether tool result was deterministic or caller-provided.
- Update CLI `simulate-dataset` to call simulation runners instead of building trajectories inline.

#### Validation strategy

- Library verification with fake `ModelClient`:
  - text-only response produces valid plain/chat row.
  - tool-call response produces `system,user,assistant,tool,assistant` in full trajectory mode.
  - `tool_decision` stops at `system,user,assistant`.
  - unknown tool name fails.
  - malformed arguments fail.
  - final assistant empty text fails or retries once.
- CLI verification:
  - deterministic README workflows remain exactly valid.
  - provider flags require config/env/model and fail cleanly if missing.
- Live provider smoke tests, skipped without env vars:
  - generate one row with OpenAI and validate JSONL.
  - generate one row with Anthropic and validate JSONL.
- Run full local checks:
  - `npm run typecheck`
  - `npm run verify`

#### Risks / fallbacks

- Risk: real models sometimes answer in text even when the scenario expects a tool call.
- Fallback: accept text responses as valid for general simulation, and add an optional `--require-tool-call` or scenario-level test mode only if needed.
- Risk: real models call multiple tools.
- Fallback: support multiple tool calls in the internal model because `AssistantToolCallMessage.toolCalls` already allows arrays; execute each tool result and include all results before final assistant generation.
- Risk: tool-result adapters grow into domain runtime logic.
- Fallback: keep bundled tool results deterministic and generic; document real tool execution as caller-supplied library integration.

### Phase 5: Provider-Backed Translation Backends

#### Files to read before starting

- `src/translation/index.ts`
- `src/providers/index.ts`
- `src/core/openai.ts`
- `src/core/validation.ts`
- `src/cli/index.ts`
- `scripts/verify-translation.mjs`
- `README.md`
- `docs/architecture.md`

#### What to do

- Keep the existing schema-preserving translation rules as the contract.
- Add provider-backed translation adapters:
  - `createOpenAITranslationAdapter(modelClient, options)`
  - `createAnthropicTranslationAdapter(modelClient, options)`
  - optional generic `createProviderTranslationAdapter(modelClient, provider, model)`
- Translation adapter behavior:
  - accepts one field at a time through `TranslationTextRequest`.
  - asks for translation from `sourceLocale` to `targetLocale`.
  - returns only translated text, with no JSON wrapper, markdown, quotes, or commentary.
  - preserves placeholders and code-like strings where instructed.
  - includes `provider` and `requestPath: "provider-adapter"`.
- Add optional batching only if it does not weaken validation:
  - direct per-field calls are simplest and safest for the first pass.
  - batch translation can be deferred unless cost/latency is a hard requirement.
- Update CLI:
  - allow `--strategy openai` and `--strategy anthropic`.
  - require `--translation-model`.
  - default `--translation-api-key-env` to `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` based on provider if not explicitly passed.
  - keep `local-pseudo` as the default and offline workflow.
- Add provider output validation:
  - translated content must be non-empty when source content is non-empty.
  - translated row must pass `assertValidOpenAIFineTuningRow`.
  - tool calls, tool result messages, and tool definitions must remain byte-for-byte equal to originals.
- Preserve and extend metadata:
  - `targetLocale`
  - `sourceLocale` where known
  - `translationStatus`
  - `translationProvider`
  - `translationRequestPath`
  - `translationModel`

#### Validation strategy

- Expand `scripts/verify-translation.mjs`:
  - existing pseudo path remains passing.
  - fake provider adapter translates text and preserves schema-bearing fields.
  - malformed provider translation output fails.
  - CLI rejects provider strategy without model/env config.
- Add live smoke scripts, skipped without env vars:
  - one-row OpenAI translation to `es-ES`, validate output.
  - one-row Anthropic translation to `fr-CA`, validate output.
- Confirm provider-backed translation does not alter:
  - assistant `tool_calls`
  - tool message `tool_call_id`
  - tool message `name`
  - tool message `content`
  - row `tools`

#### Risks / fallbacks

- Risk: provider returns extra explanation around translated text.
- Fallback: tighten prompts and fail validation rather than performing fragile broad string cleanup.
- Risk: per-field translation is slow/costly.
- Fallback: ship direct per-field provider adapters first, then add a batch adapter in a later pass with strict id-based reconstruction tests.
- Risk: translation of system prompts changes instruction meaning.
- Fallback: document translation as experimental and require validation/sample inspection before using translated rows for training.

### Phase 6: CLI, Config Files, And Public Workflow Integration

#### Files to read before starting

- `src/cli/index.ts`
- `src/index.ts`
- `src/core/scenarios.ts`
- `src/simulation/index.ts`
- `src/providers/index.ts`
- `src/translation/index.ts`
- `examples/receptionist/scenario.json`
- `examples/retail-support/scenario.json`
- `README.md`
- `docs/architecture.md`

#### What to do

- Keep the CLI dependency-light, but move business logic into library modules:
  - CLI reads args/files/env.
  - `src/simulation` generates personas and trajectories.
  - `src/providers` constructs model clients.
  - `src/translation` translates rows.
- Extend config support without forcing examples to include secrets:
  - scenario JSON remains valid.
  - optional toolkit config file can include provider runtime selections by env var name.
  - CLI flags override config file provider settings.
- Update CLI help for provider-backed flows:
  - show deterministic/offline defaults.
  - show required provider flags/env vars.
  - make experimental translation status clear.
- Add `--dry-run-config` or `--print-resolved-config` only if implementers need debug visibility; do not print actual secret values.
- Ensure all output still writes only to requested paths and respects `--force`.
- Preserve `convert-logs` as deferred with the existing error path.

#### Validation strategy

- Expand `scripts/verify-cli.mjs`:
  - deterministic workflows still pass.
  - provider-backed CLI args parse and fail clearly without env vars.
  - provider strategy accepts fake/injected path at library level.
  - overwrite safety still works.
- Add README workflow verification for deterministic docs only; live provider docs should not be part of default verification unless env-gated.
- Run `npm run verify` from a clean checkout with no provider API keys.

#### Risks / fallbacks

- Risk: CLI grows hard to maintain with manual parser.
- Fallback: keep argument additions conservative for this pass. Defer a CLI framework unless parsing complexity becomes the implementation blocker.
- Risk: config-file shape becomes unclear.
- Fallback: add one documented `examples/provider-config.example.json` that uses env var names and no secrets.

### Phase 7: Validation, Test Matrix, And Boundary Hardening

#### Files to read before starting

- `scripts/verify-fixtures.mjs`
- `scripts/verify-cli.mjs`
- `scripts/verify-translation.mjs`
- `scripts/verify-readme-workflow.mjs`
- `scripts/verify-log-deferment.mjs`
- `src/core/validation.ts`
- `src/core/dataset.ts`
- `src/providers/*`
- `src/simulation/*`
- `src/translation/*`

#### What to do

- Add a verification script for provider adapters and config, then wire it into `npm run verify`.
- Add fake-model verification helpers for deterministic provider tests without network.
- Add optional live smoke scripts that skip cleanly when env vars are missing. Keep live smoke out of required CI unless the project later has dedicated secrets.
- Expand validation where provider-backed outputs need stricter checks:
  - tool argument object shape against `ToolSchema.parameters`.
  - multiple tool calls and matching multiple tool results.
  - empty final assistant responses.
  - duplicate tool-call ids in a row.
  - translated text field non-empty when source is non-empty.
- Expand boundary scans:
  - `src/core` must not import provider SDKs.
  - `src/core` must not reference `process.env`.
  - no Cloudflare/Hono/D1/Worker/queue coupling in core.
  - provider SDK imports should be limited to `src/providers`.
- Add a small fixture for provider text response and provider tool-call response at the mapper layer.

#### Validation strategy

- Required local validation:
  - `npm run typecheck`
  - `npm run verify`
- Optional live smoke validation:
  - `OPENAI_API_KEY=... node scripts/smoke-openai-provider.mjs`
  - `ANTHROPIC_API_KEY=... node scripts/smoke-anthropic-provider.mjs`
  - analogous translation smoke scripts if not combined.
- Inspect generated live smoke JSONL with `validate-dataset`.

#### Risks / fallbacks

- Risk: live smoke tests make default verification flaky or expensive.
- Fallback: keep live smoke tests explicitly env-gated and out of default `verify`.
- Risk: schema validation against JSON Schema becomes too broad.
- Fallback: validate the subset currently modeled by `JsonSchemaValue` first: object properties, required fields, primitive types, arrays, enums, and `additionalProperties: false`.

### Phase 8: Documentation And Examples

#### Files to read before starting

- `README.md`
- `docs/architecture.md`
- `docs/full-tool-trajectory-tutorial.md`
- `CONTRIBUTING.md`
- `examples/receptionist/scenario.json`
- `examples/retail-support/scenario.json`
- `package.json`

#### What to do

- Update README status table:
  - provider-backed persona generation status.
  - provider-backed dataset simulation status.
  - provider-backed translation status.
  - deterministic/offline workflows status.
  - log-derived conversion remains deferred.
- Add provider setup docs:
  - install/build.
  - API key env vars.
  - model flags.
  - no secrets in config.
  - sample commands for OpenAI and Anthropic.
- Add an example provider config file with env var names only:
  - `examples/provider-config.example.json` or docs snippet.
- Update `docs/architecture.md`:
  - replace placeholder-provider language with concrete adapter descriptions.
  - document request/response mapping boundaries.
  - document provider errors and validation guarantees.
  - keep Cloudflare/Hono/D1/queue non-goals.
- Update `docs/full-tool-trajectory-tutorial.md`:
  - keep deterministic tutorial as the default.
  - add a short provider-backed section that requires API keys.
- Update `CONTRIBUTING.md`:
  - provider adapter implementation boundaries.
  - how to add a new provider.
  - how to write mapper tests and live smoke scripts.
- Make clear that provider-backed generation can produce variable content and users should inspect/validate outputs before fine-tuning.

#### Validation strategy

- Run existing README workflow verification with deterministic commands.
- Manually sanity-check provider command examples for flag names against CLI help.
- If live smoke scripts are available and env vars are present, run one OpenAI and one Anthropic example and validate the outputs.

#### Risks / fallbacks

- Risk: docs overpromise provider-backed quality.
- Fallback: describe the feature as real provider-backed generation with validation, not as guaranteed high-quality training data.
- Risk: users copy config with secrets.
- Fallback: docs and examples use only env var names and explicitly warn against putting API keys in repo files.

## Recommended Implementation Order

1. Implement provider config/auth/errors first. This lowers risk for every later phase and gives the CLI a coherent way to select providers.
2. Implement provider adapters and mapper tests second. Do not touch simulation behavior until the raw model invocation contract works.
3. Move deterministic persona/simulation logic from CLI into `src/simulation` before adding model-backed runners. This avoids mixing new provider code with CLI-local generation.
4. Add model-backed persona generation.
5. Add model-backed conversation simulation with deterministic tool-result adapters.
6. Add provider-backed translation after provider clients are stable.
7. Harden validation and docs last, while preserving offline README workflows.

## Blocking Decisions

No truly blocking product decision is required before implementation if the team accepts these defaults:

- Default provider-backed adapters: OpenAI and Anthropic.
- Default offline behavior: deterministic sample generation and local-pseudo translation remain available and remain the README-verified baseline.
- Default auth model: config stores env var names; API keys are read from environment variables.
- Default provider smoke tests: opt-in and skipped unless API keys are present.
- Default log-derived conversion stance: deferred and untouched.

The only decision worth confirming early is which concrete model names should appear in documentation examples. Implementation should avoid hard-coding model names beyond examples and should require users to pass `--simulation-model` / `--translation-model` for provider-backed flows.

## Exit Criteria

- `openAIProviderAdapter` and `anthropicProviderAdapter` are real adapters that satisfy `ModelClient`.
- Provider-backed persona generation can produce validated `PersonaDefinition[]` through OpenAI or Anthropic.
- Provider-backed `simulate-dataset` can generate at least one valid OpenAI JSONL row in `full_tool_trajectory` mode through OpenAI or Anthropic with real API keys.
- Provider-backed `translate-dataset` supports OpenAI and Anthropic strategies while preserving tool calls, tool results, tools, and valid JSONL shape.
- Deterministic/offline README workflows still pass without API keys.
- `npm run typecheck` and `npm run verify` pass without provider API keys.
- Optional live smoke scripts skip cleanly without env vars and validate generated output when env vars are present.
- `src/core` remains provider-neutral and free of Cloudflare/Hono/D1/Worker/queue coupling.
- README, architecture docs, tutorial, and contributing docs describe real provider-backed usage accurately.
