# ZueDocs Docs Site Implementation Plan

## State of Current System

The `finetuning` repo is a standalone TypeScript package and CLI for generating, validating, and translating OpenAI chat fine-tuning datasets from scenario definitions. It is currently on `main` and has no Astro docs app, no `src/content/docs` collection, no `astro.config.mjs`, and no `zuedocs` dependency. Its existing documentation surface is plain markdown:

- `README.md` is the primary user guide.
- `docs/architecture.md` describes module boundaries, supported workflows, provider boundaries, output guarantees, scenario configuration, and deferred real-log conversion.
- `docs/full-tool-trajectory-tutorial.md` is a short deterministic tutorial.
- `CONTRIBUTING.md` documents module boundaries and verification expectations, but still contains stale language that says provider-backed simulation and translation are adapter-boundary work.

The current codebase is further ahead than parts of the docs imply:

- `src/core` owns provider-neutral types, scenario parsing, fixtures, OpenAI row formatting, validation, dataset summaries, and the explicit deferred real-log conversion boundary.
- `src/providers` contains concrete OpenAI and Anthropic adapters, provider runtime config/env resolution, provider errors, and mapping functions for OpenAI Responses and Anthropic Messages APIs.
- `src/simulation` contains deterministic persona generation, model-backed persona generation, deterministic simulation, model-backed simulation, deterministic tool results, caller-supplied tool-result adapter boundaries, provider tool-call validation, and scenario loading.
- `src/translation` contains local-pseudo translation plus provider-backed OpenAI/Anthropic translation adapters through the shared `ModelClient` boundary.
- `src/cli/index.ts` exposes `generate-personas`, `simulate-dataset`, `validate-dataset`, `translate-dataset`, and deferred `convert-logs`; it supports provider config files, explicit provider flags, default provider env vars, deterministic/offline defaults, overwrite protection, and validation before writes.
- `examples/receptionist/scenario.json`, `examples/retail-support/scenario.json`, and `examples/provider-config.example.json` are the main example inputs.
- `scripts/verify-*.mjs` verify deterministic CLI flows, README workflows, full tool trajectory shape, provider config, provider adapter mappers, model-backed persona generation, model-backed simulation runners, schema-preserving translation, and log-conversion deferment.

Current data flow:

1. A user selects a bundled profile or scenario JSON through `--profile` or `--config`.
2. `src/cli` reads optional provider config from `--provider-config` or toolkit-style `--config`.
3. `src/simulation/loadScenarioSource` parses scenario data and exposes bundled/personaSource personas.
4. `generate-personas` uses deterministic or model-backed persona generators.
5. `simulate-dataset` uses deterministic or model-backed simulation runners to produce provider-neutral `ConversationTrajectory[]`.
6. `src/core/openai.ts` exports trajectories to OpenAI chat fine-tuning JSONL in `plain_chat`, `tool_decision`, or `full_tool_trajectory` mode.
7. `src/core/validation.ts` validates messages, tool calls, tool result references, tool names, duplicate ids, and tool argument schemas.
8. `translate-dataset` validates source JSONL, translates natural-language fields with local-pseudo or provider adapters, preserves tool calls/tool results/tools, then validates output.
9. `convert-logs` intentionally exits with a deferred-boundary error until a public log contract, redaction hooks, privacy guidance, and fixture coverage exist.

The target docs site should be an embedded static Astro app powered by `zuedocs`, using the same consuming pattern as `cf-cli` rather than running `zuedocs init` over the existing repo. `zuedocs` explicitly says `zuedocs init` requires an empty target directory and that existing repos should wire the shared shell manually or scaffold a separate subdirectory. `cf-cli` demonstrates the in-repo manual wiring pattern:

- `package.json` includes Astro scripts: `dev`, `build`, `preview`, `check`.
- `devDependencies` include `astro`, `@astrojs/check`, `typescript`, `@types/node`, and `zuedocs`.
- `astro.config.mjs` sets static output.
- `src/content.config.ts` defines a `docs` collection loaded from `src/content/docs/**/*.md`, with frontmatter fields `title`, `description`, `order`, `category`, and optional `summary`.
- `src/data/docs.ts` owns `siteConfig`, `docCategories`, `primaryNav`, and footer content.
- `src/pages/index.astro` is repo-specific landing copy using `zuedocs/layouts/BaseLayout.astro`.
- `src/pages/docs/index.astro` groups docs by category and uses `zuedocs/components/DocsPageActions.astro`.
- `src/pages/docs/[...slug].astro` renders collection entries with `zuedocs/layouts/DocsPageLayout.astro`, sidebar groups, and heading table of contents.
- `src/pages/docs.md.ts` and `src/pages/docs/[...slug].md.ts` expose raw markdown routes for agent/tool consumption.
- `src/content/docs/*.md` contains product docs with collection frontmatter.

## State of Ideal System

The ideal `finetuning` repo has a small, static, zuedocs-powered docs site embedded in the repo root and ready for static deployment. The site should be useful on first load, not just a migrated markdown dump.

The ideal implementation should:

- Add an Astro docs app in the repo root using `zuedocs` as a versioned dependency.
- Preserve the package's existing TypeScript library/CLI build behavior.
- Add docs scripts without breaking `npm run build`, `npm run typecheck`, or `npm run verify`.
- Keep docs app files local to the repo: `src/data/docs.ts`, `src/content.config.ts`, `src/pages/**`, and `src/content/docs/*.md`.
- Keep shared presentation imported from `zuedocs` instead of copying its layouts, components, enhancement script, or CSS.
- Convert current markdown into content collection pages with frontmatter, categories, order, summaries, and stable slugs.
- Update stale provider-backed documentation so the site reflects the current source: concrete OpenAI/Anthropic provider adapters exist, model-backed persona/simulation flows exist, provider-backed translation exists, and real-log conversion remains deferred.
- Include practical docs for deterministic/offline workflows, provider-backed workflows, scenario authoring, full tool trajectories, translation, validation, architecture, examples, and contributing/maintenance.
- Expose raw markdown routes equivalent to `cf-cli`: `/docs.md` and `/docs/<slug>.md`.
- Include deployment readiness only at the repo level: static Astro output, build/check scripts, and a short maintenance page. Do not plan custom-domain wiring or Vercel project setup inside the app.

Recommended initial doc categories:

- `Start`: quickstart, install/build, first deterministic dataset.
- `Dataset Workflows`: full tool trajectories, export modes, validation, translation.
- `Provider Workflows`: provider config, OpenAI/Anthropic generation, provider-backed translation, API key/env handling.
- `Authoring`: scenario configuration, examples, tool schemas, persona generation.
- `Reference`: architecture, CLI command reference, contributing/maintenance, deferred log conversion.

## Parallel Execution Model

The implementation should be organized as parallel workstreams with one short integration pass. This avoids unnecessary serialization and reduces file conflicts.

Workstream dependency map:

- Workstream A, app/bootstrap wiring, can start immediately.
- Workstream B, content migration and information architecture, can start immediately after agreeing on `docCategories` and slugs.
- Workstream C, navigation/search/config, can start after Workstream B proposes final categories/slugs, but most of `siteConfig` can be drafted immediately.
- Workstream D, docs polish/examples/tutorial migration, can start immediately and merge into Workstream B's markdown files.
- Workstream E, deployment readiness/build config, can start after Workstream A chooses scripts/dependencies.
- Workstream F, integration and validation, must run after A-E land.

Low-conflict file ownership:

- A owns `astro.config.mjs`, `src/content.config.ts`, `src/pages/docs/index.astro`, `src/pages/docs/[...slug].astro`, `src/pages/docs.md.ts`, `src/pages/docs/[...slug].md.ts`, and package dependency/script edits.
- B owns `src/content/docs/*.md` initial migration and slug map.
- C owns `src/data/docs.ts` and navigation/footer text, with a small coordination point on categories from B.
- D owns content improvements inside migrated markdown, especially examples/tutorial/provider wording.
- E owns package scripts, build/check docs, `.gitignore` additions if needed, and optional maintenance docs sections.
- F owns final conflict resolution, route sanity, script validation, and source/docs consistency checks.

## Plan Phases

### Phase 0: Coordination Spine And Slug Contract

Parallelism: sequenced first; short coordination phase before parallel implementation.

#### Files to read before starting

- `README.md`
- `docs/architecture.md`
- `docs/full-tool-trajectory-tutorial.md`
- `package.json`
- `/Users/ashray/code/amxv/cf-cli/src/data/docs.ts`
- `/Users/ashray/code/amxv/cf-cli/src/content.config.ts`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs/index.astro`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs/[...slug].astro`
- `/Users/ashray/code/amxv/zuedocs/README.md`

#### What to do

- Confirm the docs site will be embedded at the repo root using manual `cf-cli`-style wiring, not `zuedocs init`.
- Define the initial slug/category contract before parallel content and nav work begins.
- Use a slug map like:
  - `quickstart`
  - `full-tool-trajectories`
  - `scenario-authoring`
  - `provider-config`
  - `translation`
  - `validation`
  - `cli-reference`
  - `architecture`
  - `examples`
  - `log-conversion-deferred`
  - `docs-site-maintenance`
- Decide whether to keep the legacy `docs/architecture.md` and `docs/full-tool-trajectory-tutorial.md` as source files after migration or make `src/content/docs` the canonical docs source. Recommended: migrate canonical docs to `src/content/docs`, then keep the old files only if package distribution or external links require them.

#### Validation strategy

- Produce a one-screen slug/category checklist before parallel work starts.
- Verify every planned doc page has one category from `docCategories`.
- Verify no planned route conflicts with existing CLI/library source paths.

#### Risks / fallbacks

- Risk: parallel agents edit the same markdown files.
- Fallback: assign one owner per slug and require D to patch B-owned files only after B finishes initial frontmatter migration.
- Risk: removing old `docs/*.md` breaks package `files` expectations or existing links.
- Fallback: keep old markdown files for this pass and add links from them to the new docs site source later.

### Phase 1A: ZueDocs App / Bootstrap Wiring

Parallelism: can run independently after Phase 0. Coordinate only with Phase 1C for import paths and categories.

#### Files to read before starting

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `/Users/ashray/code/amxv/cf-cli/package.json`
- `/Users/ashray/code/amxv/cf-cli/astro.config.mjs`
- `/Users/ashray/code/amxv/cf-cli/src/content.config.ts`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs/index.astro`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs/[...slug].astro`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs.md.ts`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs/[...slug].md.ts`
- `/Users/ashray/code/amxv/zuedocs/README.md`

#### What to do

- Add Astro/zuedocs dependencies using the existing package manager style. The repo currently uses `package-lock.json`, so prefer npm unless the team explicitly chooses Bun for docs.
- Add docs-oriented scripts without breaking package scripts. Recommended:
  - keep `build` as `tsc` because package build/verify rely on it
  - add `docs:dev`
  - add `docs:check`
  - add `docs:build`
  - add `docs:preview`
- Add `astro.config.mjs` with `output: "static"`.
- Add `src/content.config.ts` using Astro content collections and `docCategories` imported from `src/data/docs.ts`, matching the `cf-cli` pattern.
- Add `src/pages/docs/index.astro`, `src/pages/docs/[...slug].astro`, `src/pages/docs.md.ts`, and `src/pages/docs/[...slug].md.ts` using `zuedocs` imports rather than copied local layouts.
- Add a minimal `src/pages/index.astro` landing page that introduces `finetuning` as a toolkit and links to quickstart/docs.
- Import `zuedocs/docsEnhancements` in the docs index and article route as `cf-cli` does.
- Do not copy `zuedocs` global CSS, layouts, or components into this repo.

#### Validation strategy

- Run `npm run docs:check` after dependencies are installed.
- Run `npm run docs:build`.
- Confirm the static build emits HTML for `/`, `/docs`, every content slug, `/docs.md`, and `/docs/<slug>.md`.
- Confirm `npm run build` still runs `tsc` for the package.

#### Risks / fallbacks

- Risk: Astro's TypeScript/content generated types conflict with the package `tsconfig.json` using `rootDir: "src"` and `include: ["src/**/*.ts"]`.
- Fallback: keep Astro source compatible with the existing TS config, add a dedicated `tsconfig.astro.json` only if `astro check` requires it, and avoid changing the package `tsconfig` unless validation proves it is necessary.
- Risk: adding Astro to the same `src` tree affects `tsc`.
- Fallback: if `tsc` tries to compile Astro content helpers incorrectly, adjust package `tsconfig.json` include/exclude narrowly so package TS still includes `src/**/*.ts` needed for library code while excluding Astro-generated or route-only files if needed.

### Phase 1B: Content Migration And Information Architecture

Parallelism: can run independently after Phase 0. Coordinate with Phase 1C on categories and with Phase 1D on content polish ownership.

#### Files to read before starting

- `README.md`
- `docs/architecture.md`
- `docs/full-tool-trajectory-tutorial.md`
- `gg/agent-outputs/fine-tuning-oss-extraction-plan-2026-07-06.md`
- `gg/agent-outputs/provider-backed-adapters-implementation-plan-2026-07-06.md`
- `src/index.ts`
- `src/cli/index.ts`
- `src/core/model.ts`
- `src/core/openai.ts`
- `src/core/validation.ts`
- `src/core/scenarios.ts`
- `src/simulation/index.ts`
- `src/providers/index.ts`
- `src/translation/index.ts`
- `examples/receptionist/scenario.json`
- `examples/retail-support/scenario.json`
- `examples/provider-config.example.json`

#### What to do

- Create `src/content/docs/*.md` files with frontmatter matching `src/content.config.ts`.
- Split the current README into site-native pages instead of one long page:
  - `quickstart.md`: install/build, deterministic first dataset, validate output.
  - `cli-reference.md`: command map for `generate-personas`, `simulate-dataset`, `validate-dataset`, `translate-dataset`, `convert-logs`.
  - `examples.md`: receptionist and retail support scenarios, provider-config example, output directory guidance.
- Migrate `docs/full-tool-trajectory-tutorial.md` into `full-tool-trajectories.md`, preserving the canonical `system,user,assistant,tool,assistant` sequence and the deterministic verification commands.
- Migrate `docs/architecture.md` into `architecture.md`, but update stale provider status to match current code.
- Add `scenario-authoring.md` covering scenario fields, persona source, tool inventory, conversation goals, stopping rules, and provider-neutral tool schemas.
- Add `provider-config.md` covering `--provider-config`, toolkit-style config, `provider`, `model`, `apiKeyEnv`, `baseUrl`, `temperature`, `maxOutputTokens`, headers, metadata, CLI override precedence, and "env var names, not secrets."
- Add `translation.md` covering local-pseudo default, provider-backed OpenAI/Anthropic strategies, preservation rules, metadata, BCP 47 locales, and experimental status.
- Add `validation.md` covering row shape checks, tool-call argument JSON, tool-result references, schema validation, duplicate ids, dataset summary output, and `npm run verify`.
- Add `log-conversion-deferred.md` explaining why real-log conversion is deferred and what must exist before release.
- Add `docs-site-maintenance.md` for editing/running/building the docs site.
- Preserve exact commands from existing verified workflows where possible.

#### Validation strategy

- Check every markdown file has `title`, `description`, numeric `order`, valid `category`, and optional `summary`.
- Cross-check workflow commands against `scripts/verify-readme-workflow.mjs`, `scripts/verify-cli.mjs`, and `src/cli/index.ts`.
- Search migrated docs for stale phrases like "provider-backed simulation is deferred" or "adapter placeholders" and correct them.
- Ensure real-log conversion remains described as deferred.

#### Risks / fallbacks

- Risk: migrated docs overstate live provider quality.
- Fallback: describe provider-backed workflows as implemented and validated through adapters/fake-model tests, with optional real-provider runs requiring user-supplied API keys and model names.
- Risk: content migration creates duplicate/conflicting docs between `docs/` and `src/content/docs`.
- Fallback: make `src/content/docs` canonical for the site and keep legacy docs only as package-shipped references until a separate cleanup pass.

### Phase 1C: Navigation, Site Config, And Raw Markdown Access

Parallelism: can run mostly independently. It depends on Phase 0's category/slug contract and should coordinate with Phase 1B before final category names.

#### Files to read before starting

- `/Users/ashray/code/amxv/cf-cli/src/data/docs.ts`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs.md.ts`
- `/Users/ashray/code/amxv/cf-cli/src/pages/docs/[...slug].md.ts`
- `/Users/ashray/code/amxv/zuedocs/README.md`
- `README.md`
- `package.json`

#### What to do

- Add `src/data/docs.ts` with:
  - `siteConfig.name = "finetuning"` or `"@amxv/finetuning"` depending on desired site branding.
  - strapline centered on fine-tuning dataset generation.
  - description grounded in synthetic scenario-driven OpenAI JSONL, full tool trajectories, validation, provider-backed workflows, and schema-preserving translation.
  - `repoUrl` for the eventual GitHub repo; if unknown, use the current package/repo convention and avoid fake private URLs.
  - footer sections for toolkit purpose, workflow coverage, and repository source.
  - `themeToggle` only if the default should be changed; otherwise omit it.
- Add `docCategories` and `primaryNav` matching the final IA.
- Ensure raw markdown routes produce useful `/docs.md` index content grouped by `docCategories`.
- Do not add client-side search unless zuedocs exposes or documents it. The current `zuedocs`/`cf-cli` pattern has category navigation, sidebar, table of contents, and raw markdown routes, not a search component.

#### Validation strategy

- Confirm `src/content.config.ts` imports and uses `docCategories` so categories cannot drift.
- Confirm `/docs.md` includes every content page exactly once.
- Confirm sidebar grouping in `/docs/<slug>` follows the same category order as `/docs`.

#### Risks / fallbacks

- Risk: "navigation/search/config" scope turns into custom search implementation.
- Fallback: treat search as out of scope unless `zuedocs` adds an exported search surface. Use category grouping, browser find, raw markdown endpoints, and the generated TOC for this pass.
- Risk: repo URL is unknown.
- Fallback: use a placeholder only if the existing repo metadata already contains one; otherwise set a conservative source label and update when the remote is known.

### Phase 1D: Docs Polish, Examples, And Tutorial Accuracy

Parallelism: can start after Phase 0 and run alongside Phase 1B. To avoid conflicts, D should own specific pages or provide patches after B creates initial files.

#### Files to read before starting

- `README.md`
- `docs/full-tool-trajectory-tutorial.md`
- `examples/receptionist/scenario.json`
- `examples/retail-support/scenario.json`
- `examples/provider-config.example.json`
- `scripts/verify-readme-workflow.mjs`
- `scripts/verify-provider-config.mjs`
- `scripts/verify-persona-generation.mjs`
- `scripts/verify-simulation-runners.mjs`
- `scripts/verify-translation.mjs`
- `scripts/verify-log-deferment.mjs`

#### What to do

- Make the quickstart copy executable from a clean checkout:
  - `npm install`
  - `npm run build`
  - deterministic `simulate-dataset`
  - `validate-dataset`
- Add a clear "offline by default" explanation.
- Add provider-backed examples that require explicit model names and env vars, without hard-coding secrets.
- Add a provider-config page section that shows `examples/provider-config.example.json` and explains override precedence.
- Add tutorial examples for both `--profile sample-receptionist` and `--config examples/receptionist/scenario.json`.
- Explain export modes with examples:
  - `plain_chat`
  - `tool_decision`
  - `full_tool_trajectory`
- Add a compact "what validation catches" section.
- Update translation docs to say provider-backed translation is implemented but experimental.
- Keep real-log conversion in its own deferred page so users do not confuse it with dataset validation or translation.

#### Validation strategy

- Compare every command against actual CLI flags in `src/cli/index.ts`.
- Prefer commands already exercised by verification scripts.
- For provider examples, verify failure behavior is documented: missing model/env should fail before provider calls.
- Check docs do not instruct users to store API keys in config files.

#### Risks / fallbacks

- Risk: provider docs imply default model names.
- Fallback: require `<model>` placeholders and explain users must choose models supported by their provider account.
- Risk: tutorial becomes too broad.
- Fallback: keep deterministic tutorial as the canonical first path and move provider-backed examples to `provider-config.md`.

### Phase 1E: Deployment Readiness And Build Config

Parallelism: can run after Phase 1A has selected dependencies/scripts. It should coordinate with Phase 1B for `docs-site-maintenance.md`.

#### Files to read before starting

- `package.json`
- `package-lock.json`
- `.gitignore`
- `tsconfig.json`
- `/Users/ashray/code/amxv/cf-cli/package.json`
- `/Users/ashray/code/amxv/cf-cli/src/content/docs/docs-site.md`
- `/Users/ashray/code/amxv/zuedocs/README.md`

#### What to do

- Ensure docs build artifacts are ignored. `dist/` is already ignored; confirm Astro output uses `dist` or set an output directory that does not collide unexpectedly with package `tsc` output.
- Decide whether Astro static output should share `dist` with package `tsc`. Recommended: avoid collision by configuring Astro `outDir` to a docs-specific ignored path such as `docs-dist` if `npm run build` still writes TypeScript to `dist`.
- If using a docs-specific outDir, add it to `.gitignore` and document it in `docs-site-maintenance.md`.
- Add package scripts that make deployment readiness obvious:
  - `docs:check`
  - `docs:build`
  - `docs:preview`
- Do not plan domain wiring, Cloudflare DNS, or Vercel project mechanics beyond documenting the static build command and output directory.
- Optionally add a combined validation script such as `verify:docs` if the project wants docs checks separate from `npm run verify`. Recommended: keep docs validation separate initially to avoid slowing package verification unless the team wants default docs CI.

#### Validation strategy

- Run package validation:
  - `npm run build`
  - `npm run typecheck`
  - `npm run verify`
- Run docs validation:
  - `npm run docs:check`
  - `npm run docs:build`
- Inspect build output location and confirm it does not erase or mask package `dist` unexpectedly.

#### Risks / fallbacks

- Risk: Astro default `dist` conflicts with the package's TypeScript `dist`.
- Fallback: set `outDir: "docs-dist"` in `astro.config.mjs` and ignore `docs-dist/`.
- Risk: adding docs checks to `npm run verify` creates a broad failure surface.
- Fallback: keep docs checks as explicit scripts for this implementation pass, then wire into CI later if desired.

### Phase 2: Integration Pass

Parallelism: sequenced after Phase 1A-E.

#### Files to read before starting

- `package.json`
- `astro.config.mjs`
- `src/content.config.ts`
- `src/data/docs.ts`
- `src/pages/index.astro`
- `src/pages/docs/index.astro`
- `src/pages/docs/[...slug].astro`
- `src/pages/docs.md.ts`
- `src/pages/docs/[...slug].md.ts`
- all `src/content/docs/*.md`
- `README.md`
- `docs/architecture.md`
- `docs/full-tool-trajectory-tutorial.md`
- `CONTRIBUTING.md`

#### What to do

- Resolve final category/order/sidebar consistency.
- Ensure landing page cards link only to routes that exist.
- Ensure docs index copy describes `finetuning` rather than generic `zuedocs` or `cf-cli` language.
- Ensure every content page has stable frontmatter and a unique `order`.
- Decide whether to add a README pointer to the docs site source. If yes, keep it small and avoid replacing the README wholesale unless requested.
- Update obviously stale `CONTRIBUTING.md` provider-adapter language if it would conflict with the new docs. Keep this scoped; do not refactor contribution docs beyond docs-site accuracy.
- Verify no copied `cf-cli` product text remains.
- Verify no copied local `zuedocs` layout/component code was introduced.

#### Validation strategy

- Run `rg "cf-cli|Cloudflare operations|ZueDocs turns|template chassis|adapter placeholders|provider-backed simulation and provider-backed translation are adapter-boundary work" src/content src/pages src/data README.md docs CONTRIBUTING.md`.
- Run package and docs checks:
  - `npm run build`
  - `npm run typecheck`
  - `npm run verify`
  - `npm run docs:check`
  - `npm run docs:build`
- If a dev server is started for visual QA, use the docs dev script and inspect `/`, `/docs`, a representative article, `/docs.md`, and `/docs/full-tool-trajectories.md`.

#### Risks / fallbacks

- Risk: parallel work introduces duplicate pages or inconsistent ordering.
- Fallback: keep the page set small for v1 and merge overlapping pages into the closest category.
- Risk: package verification fails because docs files change TypeScript compilation scope.
- Fallback: fix script/config isolation before adjusting source code.

## Cross-Provider Requirements

Cross-provider requirements matter for docs content but not for docs-site runtime behavior.

- The docs site itself should not call OpenAI, Anthropic, or any provider API.
- Provider docs must accurately describe OpenAI and Anthropic as concrete supported adapters in the current source.
- Provider-backed commands must remain explicit: provider, model, and API key env var selection should be visible in examples.
- Config examples must store env var names, never API key values.
- Docs must distinguish:
  - deterministic/offline persona generation and simulation
  - model-backed OpenAI/Anthropic persona generation and simulation
  - local-pseudo translation
  - provider-backed OpenAI/Anthropic translation
  - canonical OpenAI chat fine-tuning JSONL export regardless of generation provider
- Docs must explain that real-log conversion is deferred and requires public log shape, extraction rules, redaction hooks, privacy-safe fixtures, and provider/runtime-independent implementation before release.

## Recommended Execution Assignment

Recommended parallel assignment for a small team:

- Agent 1: Phase 1A app/bootstrap wiring.
- Agent 2: Phase 1B initial markdown migration and IA.
- Agent 3: Phase 1C `src/data/docs.ts`, navigation, footer, and raw markdown route consistency.
- Agent 4: Phase 1D examples/tutorial/provider content polish.
- Agent 5: Phase 1E deployment-readiness scripts/output-dir decisions.
- Lead/integrator: Phase 0 upfront and Phase 2 final integration.

To reduce conflicts, agents should avoid editing files outside their assigned ownership until Phase 2. If an agent needs a shared file change, leave a short note for the integrator or patch only a clearly scoped section.

## Blocking Decisions

No truly blocking product decision is required before implementation if the team accepts these defaults:

- Embed the docs site at the repo root with manual `cf-cli`-style wiring.
- Use `zuedocs` as a dependency and keep shared UI imported from the package.
- Keep package `npm run build` as TypeScript compilation and add separate docs scripts.
- Use `src/content/docs` as the docs site's content source.
- Keep deterministic/offline workflows as the first-run tutorial path.
- Treat provider-backed workflows as implemented but explicit/advanced.
- Keep real-log conversion deferred.

One decision should be made early to avoid build-output conflict:

- Recommended: configure Astro to output to `docs-dist` and add `docs-dist/` to `.gitignore`, because TypeScript already uses `dist/`.

## Exit Criteria

- The repo has a working zuedocs-powered Astro docs site.
- `src/data/docs.ts`, `src/content.config.ts`, `src/pages/**`, and `src/content/docs/*.md` follow the `cf-cli` consuming pattern.
- The site renders `/`, `/docs`, each planned docs page, `/docs.md`, and each raw page markdown endpoint.
- Docs reflect the current source, including provider-backed adapters, model-backed generation/simulation, provider-backed translation, and deferred real-log conversion.
- Existing package workflows still pass.
- Docs workflows pass.
- Build output does not collide with package TypeScript output.
- The final implementation is deployment-ready as static output without including domain wiring or Vercel project mechanics in app code.
