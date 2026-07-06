# Fine-Tuning OSS Extraction Plan

## State of Current System

The current repository contains a substantial fine-tuning workflow embedded inside a Cloudflare Workers receptionist backend. The fine-tuning code is concentrated under `src/lib/fine-tuning`, with supporting tool schemas in `src/brain/functions/tools-def.ts`, operational translation wiring in `src/routes/fine-tuning.ts` and `src/queues/translate-example.ts`, and storage types in `src/types.ts` and `src/db/schema.ts`.

The generation pipeline already has the important primitives:

- synthetic company/business fixtures in `src/lib/fine-tuning/test-data.ts`
- prompt templates for receptionist, persona generation, and simulated visitors in `src/lib/fine-tuning/prompts.ts`
- persona generation in `src/lib/fine-tuning/companies.ts`
- simulated visitor behavior in `src/lib/fine-tuning/sim-visitor.ts`
- simulated receptionist behavior in `src/lib/fine-tuning/sim-receptionist.ts`
- OpenAI-format dataset conversion in `src/lib/fine-tuning/openai-dataset.ts`
- dataset generation and JSONL persistence in `src/lib/fine-tuning/save.ts`
- translation helpers in `src/lib/fine-tuning/translation/*`

The current dataset exporter is closest to “tool-call decision training” rather than full tool-trajectory training. The fine-tuning-specific simulator returns immediately when the assistant chooses a tool, instead of continuing through simulated tool execution and recording the tool result plus final assistant response.

The code is also tightly coupled to local runtime choices:

- `Bindings` in `src/types.ts` assume Cloudflare Workers secrets and services
- `Bun.file` / `Bun.write` are used directly in scripts
- translation storage is implemented via Cloudflare queue + D1
- model access goes through local wrappers such as `openaiCompletion` and `anthropicMultiTurn`
- the repository includes generated artifacts (`dataset.jsonl`, `dataset-fixed.jsonl`, `personas.json`) alongside library code

This means the raw logic is strong enough to extract, but the public version should not be a direct copy. It needs boundaries, packaging, and explicit decisions about dataset scope.

## State of Ideal System

The ideal public repository is a standalone, provider-aware fine-tuning toolkit that helps users generate, normalize, validate, and optionally localize chat fine-tuning datasets for OpenAI models without depending on the receptionist backend.

The ideal system should:

- expose a clean CLI and library surface for dataset generation
- make all runtime integrations pluggable rather than Cloudflare-specific
- support both plain-chat examples and tool-calling examples
- support full tool trajectories, not just tool-call decisions
- keep prompts, schemas, simulators, and output formatters in separate modules
- separate example/demo data from the reusable framework
- validate dataset rows before writing output
- document what is synthetic versus real-log-derived
- document provider assumptions and expected model behavior

For OSS, the repository should tell a clear story:

1. Define tools and prompts.
2. Generate personas or other scenario sources.
3. Simulate conversations.
4. Emit OpenAI fine-tuning-ready JSONL.
5. Optionally translate/localize datasets.
6. Optionally derive datasets from real logs using adapters.

The public repo should be usable in at least two modes:

- library mode for people embedding the toolkit into their own systems
- CLI mode for users who just want commands like `generate-personas`, `simulate-dataset`, `validate-jsonl`, and `translate-dataset`

## Cross-provider Requirements

- Keep OpenAI dataset output as the canonical export format.
- Treat model invocation as an adapter layer so generation can use OpenAI, Anthropic, or another provider for simulation.
- Keep tool schemas provider-neutral internally, with explicit converters for OpenAI and Anthropic wire formats.
- Do not assume Cloudflare `Bindings` outside the current repo.
- Do not assume Bun-only filesystem APIs in core modules; prefer standard Node-compatible filesystem abstractions or isolate Bun use to scripts.
- Define a canonical internal conversation trajectory type that can represent:
  - system/user/assistant text messages
  - assistant tool call messages
  - tool result messages
  - final assistant responses after tool execution
- Make translation provider selection explicit. The current code labels one helper as Gemini while routing through a local completion wrapper; the OSS repo should make provider identity and request path unambiguous.

## Plan Phases

### Phase 1: Define OSS Scope And Public Surface

#### Files to read before starting

- `src/lib/fine-tuning/index.ts`
- `src/lib/fine-tuning/openai-dataset.ts`
- `src/lib/fine-tuning/save.ts`
- `src/lib/fine-tuning/prompts.ts`
- `src/brain/functions/tools-def.ts`
- `src/types.ts`

#### What to do

- Decide the explicit product scope for the OSS repo:
  - synthetic dataset generation only
  - synthetic + translation
  - synthetic + translation + log-to-dataset import
- Lock the target audience:
  - developers building model-specific assistants
  - teams creating fine-tuning corpora with tools
  - experimental researchers doing simulation-driven dataset generation
- Define the initial public API:
  - library entrypoints
  - CLI commands
  - config file shape
- Choose the canonical feature set for v1:
  - full tool-trajectory support
  - chat-only support
  - translation support
  - validation support
- Explicitly de-scope receptionist-specific production runtime concerns from the public repo:
  - Cloudflare queue handlers
  - D1 persistence
  - Hono routes
  - receptionist dashboard/storage concerns

#### Validation strategy

- Produce a short architecture note in the new repo describing:
  - supported workflows
  - supported providers
  - output guarantees
  - non-goals
- Review the note against the current code and verify every exported feature has code evidence in this repo or is intentionally deferred.

#### Risks / fallbacks

- Risk: trying to ship too much in v1 will preserve backend coupling.
- Fallback: ship a narrower v1 with synthetic generation + JSONL validation first, then add translation and log import later.

### Phase 2: Define Canonical Data Model

#### Files to read before starting

- `src/types.ts`
- `src/lib/fine-tuning/openai-dataset.ts`
- `src/lib/fine-tuning/ft-sim-receptionist.ts`
- `src/lib/fine-tuning/sim-receptionist.ts`
- `src/lib/fine-tuning/fix-dataset.ts`

#### What to do

- Introduce a canonical internal type system for:
  - business context
  - persona definitions
  - simulation messages
  - tool schemas
  - tool calls
  - tool results
  - full conversation trajectories
  - exported fine-tuning rows
- Replace the current loose `FineTuningMessage` interface with a discriminated union that can represent:
  - plain text messages
  - assistant tool-call messages
  - tool result messages
- Define a trajectory-oriented builder that can export:
  - plain chat rows
  - tool-decision rows
  - full tool-trajectory rows
- Decide whether `tools` belongs in every exported example or only in datasets that use function calling.
- Add JSON schema or runtime validation for exported examples.

#### Validation strategy

- Create representative fixtures covering:
  - no-tool conversation
  - tool-call-only conversation
  - full tool-call + tool-result + final assistant response
- Ensure the export builder can serialize all fixtures into valid OpenAI fine-tuning rows.

#### Risks / fallbacks

- Risk: overfitting the type model to OpenAI output will make multi-provider simulation harder.
- Fallback: keep one provider-neutral internal trajectory model and thin provider-specific export adapters.

### Phase 3: Separate Core Logic From Backend Adapters

#### Files to read before starting

- `src/lib/fine-tuning/companies.ts`
- `src/lib/fine-tuning/sim-visitor.ts`
- `src/lib/fine-tuning/sim-receptionist.ts`
- `src/lib/fine-tuning/save.ts`
- `src/routes/fine-tuning.ts`
- `src/queues/translate-example.ts`

#### What to do

- Split the new OSS repo into packages or top-level modules such as:
  - `core/` for types, prompts, schemas, validators, formatters
  - `simulation/` for persona generation and conversation simulation
  - `providers/` for OpenAI and Anthropic invocation adapters
  - `cli/` for command-line entrypoints
  - `examples/` for receptionist-specific sample configs and datasets
- Replace `Bindings`-style dependencies with explicit adapter interfaces:
  - model client
  - filesystem writer/reader
  - optional persistence layer
- Convert hard-coded imports from local wrappers into inversion-of-control boundaries.
- Remove direct dependency on backend routes and queue handlers from the reusable library.
- Move generated artifacts out of the source tree in the public repo. Use output directories such as `outputs/` or user-specified paths.

#### Validation strategy

- Confirm the extracted modules can be imported in isolation without Cloudflare runtime types.
- Verify that no core module imports Hono, D1, Worker-specific bindings, or backend-only utility modules.

#### Risks / fallbacks

- Risk: adapter extraction becomes broad refactoring work.
- Fallback: keep a thin compatibility layer around existing wrappers for the first OSS release, but isolate them under `providers/legacy`.

### Phase 4: Upgrade Dataset Generation To Full Tool Trajectories

#### Files to read before starting

- `src/lib/fine-tuning/ft-sim-receptionist.ts`
- `src/lib/fine-tuning/sim-receptionist.ts`
- `src/lib/fine-tuning/index.ts`
- `src/lib/fine-tuning/openai-dataset.ts`
- `src/lib/fine-tuning/sim-tools.ts`

#### What to do

- Replace the “tool call ends the example” behavior with “tool call continues the simulation.”
- Define a structured turn result for the assistant simulator:
  - assistant text response
  - assistant tool call
  - tool result payload
  - final assistant post-tool response
- Reuse the existing logic pattern in `sim-receptionist.ts` as the behavioral template for tool execution.
- Decide the canonical representation of tool results in exported datasets:
  - raw JSON payloads
  - normalized JSON payloads
- Export full trajectories in OpenAI format:
  - assistant tool-call message
  - tool message with `tool_call_id`
  - final assistant content message
- Preserve an option to emit decision-only examples for users who want that mode.

#### Validation strategy

- Add fixture-based tests for `search`, `book_appointment`, and `check_availability`.
- Generate a small sample dataset and inspect rows manually to confirm the full tool sequence is present.
- Validate that exported rows conform to OpenAI function-calling expectations.

#### Risks / fallbacks

- Risk: simulated tool outputs may be too unrealistic or unstable for public examples.
- Fallback: ship normalized deterministic mock tool outputs for v1, and document how users can inject real tool adapters.

### Phase 5: Generalize Scenario And Prompt Configuration

#### Files to read before starting

- `src/lib/fine-tuning/prompts.ts`
- `src/lib/fine-tuning/test-data.ts`
- `src/lib/fine-tuning/personas.json`
- `src/lib/fine-tuning/companies.ts`

#### What to do

- Move receptionist-specific prompt language into an example package or sample template.
- Introduce configurable scenario definitions:
  - assistant role
  - business or domain context
  - user persona generator prompt
  - tool inventory
  - conversation goals
  - stopping rules
- Treat current receptionist prompts as one bundled example profile, not the framework default.
- Replace hard-coded company/persona assumptions with config-driven counts and sources.
- Support user-supplied scenario files instead of requiring code edits.

#### Validation strategy

- Recreate the current receptionist dataset using only public config + sample data in the new structure.
- Create one second sample domain to prove the toolkit is not receptionist-specific.

#### Risks / fallbacks

- Risk: over-generalizing prompts too early can weaken the repo’s clarity.
- Fallback: ship one polished receptionist example plus one minimal generic example, and defer more scenario templates.

### Phase 6: Build CLI, Validation, And Output Workflow

#### Files to read before starting

- `package.json`
- `src/lib/fine-tuning/save.ts`
- `src/lib/fine-tuning/fix-dataset.ts`
- `src/lib/fine-tuning/translation.ts`

#### What to do

- Create CLI commands for:
  - `generate-personas`
  - `simulate-dataset`
  - `validate-dataset`
  - `translate-dataset`
  - `convert-logs` if included in v1
- Replace the current top-level script side effects with explicit commands.
- Remove hard-coded assumptions such as:
  - 20 companies
  - 10 personas per company
  - fixed output filenames in source directories
- Replace rewrite-on-every-row persistence with append-safe or batch-safe output writing.
- Add dataset summary output:
  - row counts
  - tool-call counts
  - average turns
  - language distribution

#### Validation strategy

- Run the CLI end-to-end on a tiny sample config.
- Verify output lands outside source directories and can be regenerated cleanly.
- Verify validation catches malformed tool-call and tool-result rows.

#### Risks / fallbacks

- Risk: CLI design delays the extraction.
- Fallback: ship a small CLI with only `simulate-dataset` and `validate-dataset` first, keeping other flows as library APIs.

### Phase 7: Decide Translation Architecture For OSS

#### Files to read before starting

- `src/routes/fine-tuning.ts`
- `src/queues/translate-example.ts`
- `src/lib/fine-tuning/translation/gemini.ts`
- `src/lib/fine-tuning/translation/batch/createTranslationBatchFile.ts`
- `src/lib/fine-tuning/translation/batch/parseTranslatedBatch.ts`

#### What to do

- Decide whether translation is in v1 or deferred.
- If included, redesign translation as a library/CLI workflow, not a Cloudflare queue workflow.
- Fix the current language-name / language-code confusion before extraction.
- Define translation rules for:
  - system prompts
  - user/assistant content
  - tool calls
  - tool results
- Choose whether translation uses:
  - direct provider calls
  - batch-file generation
  - both
- Remove scratch/example-only batch files from the public core unless they are promoted into documented examples.

#### Validation strategy

- Translate a tiny dataset into one target language and verify:
  - schema remains valid
  - tool calls remain intact
  - non-translatable fields remain unchanged
  - translated system prompts are coherent

#### Risks / fallbacks

- Risk: translation adds complexity and provider-specific edge cases.
- Fallback: move translation into a documented “experimental” module or defer it to v1.1.

### Phase 8: Reassess Log-Derived Dataset Support

#### Files to read before starting

- `src/lib/fine-tuning/dataset.ts`
- `src/routes/test.ts`
- `src/types.ts`

#### What to do

- Decide whether real-log conversion belongs in the initial OSS release.
- If yes, finish the converter with a clear source contract:
  - accepted log shape
  - assistant content extraction rules
  - tool-call extraction rules
  - redaction hooks
- If no, remove the incomplete converter from v1 and keep it as a future roadmap item.
- If included, ensure redaction and privacy filtering are built into the public workflow from day one.

#### Validation strategy

- Convert a small redacted sample log set into JSONL and validate output rows.
- Verify the feature works independently of Cloudflare gateway internals.

#### Risks / fallbacks

- Risk: half-finished log import damages confidence in the OSS repo.
- Fallback: exclude this feature from v1 and publish it only after a real redaction and validation story exists.

### Phase 9: Documentation, Samples, And Launch Readiness

#### Files to read before starting

- `README.md`
- `api-docs.md`
- generated dataset artifacts under `src/lib/fine-tuning/`

#### What to do

- Write a new OSS-focused `README` covering:
  - what the repo does
  - supported workflows
  - how synthetic simulation works
  - how tool-calling datasets are represented
  - how to generate a sample dataset
  - what remains experimental
- Add at least one sample project config reproducing the receptionist use case.
- Add one short tutorial for full tool-trajectory fine-tuning generation.
- Add a contributor note describing provider adapters and validation expectations.
- Remove or relocate generated private artifacts that should not ship in the public repo unchanged.

#### Validation strategy

- Follow the README from a clean checkout and confirm it is sufficient to produce a sample dataset.
- Confirm the examples do not require private backend infrastructure.

#### Risks / fallbacks

- Risk: docs drift from actual extraction decisions.
- Fallback: keep v1 docs narrow and example-driven, then expand once the package boundaries stabilize.

## Recommended v1 Scope

Recommend the first public release include:

- synthetic scenario-driven dataset generation
- persona generation
- OpenAI-format export
- full tool-trajectory dataset support
- dataset validation
- one polished receptionist example profile

Recommend deferring or marking experimental:

- real-log conversion
- queue-backed translation workflows
- database-backed translated dataset storage

## Recommended Repository Shape

Suggested top-level structure for the new repo:

- `packages/core`
- `packages/providers`
- `packages/simulation`
- `packages/cli`
- `examples/receptionist`
- `examples/generic-support-agent`
- `docs`
- `outputs` in `.gitignore`

## Exit Criteria For Extraction

The extraction is ready to implement when all of the following are true:

- the public API surface is written down
- the canonical internal message/trajectory model is approved
- Cloudflare runtime concerns are removed from core modules
- full tool-trajectory export format is specified
- translation is either redesigned or explicitly deferred
- generated artifacts in the current repo are classified as:
  - sample fixture
  - private artifact to exclude
  - reproducible output to regenerate
