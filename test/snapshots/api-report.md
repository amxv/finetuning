# Public API declaration report

Generated from the public package entry points.

## dist/index.d.ts

```ts
export type { AssistantTextMessage, AssistantToolCallMessage, BuildOpenAIRowOptions, BusinessContext, CliCommandDefinition, ConversationMessage, ConversationTrajectory, DatasetSummary, DatasetValidationIssue, DatasetValidationResult, DeferredLogConversionBoundary, ExportMode, FineTuningToolkitConfig, JsonObject, JsonPrimitive, JsonSchemaObject, JsonSchemaValue, JsonValue, OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow, OpenAIToolCall, OpenAIToolDefinition, PersonaDefinition, PublicWorkflow, ScenarioDefinition, ScenarioPersonaSource, ScenarioStoppingRules, ScenarioToolInventory, SimulatedAssistantTurn, SupportedProvider, SystemMessage, ToolCall, ToolResult, ToolResultMessage, ToolSchema, UserMessage, ValidationIssue, ValidationResult, ValidationSummary, WorkflowStatus, } from "./core/index.js";
export type { TranslateOpenAIJsonlOptions, TranslateOpenAIRowOptions, ProviderTranslationAdapterOptions, TranslationProviderKind, TranslationRequestPath, TranslationResult, TranslationRules, TranslationTextAdapter, TranslationTextRequest, TranslationWorkflowStatus, } from "./translation/index.js";
export { assertValidOpenAIFineTuningRow, bookAppointmentTool, bookAppointmentToolTrajectoryFixture, buildOpenAIFineTuningRow, buildOpenAIFineTuningRows, bundledScenarioProfiles, checkAvailabilityTool, checkAvailabilityToolTrajectoryFixture, createDeferredLogConversionError, deferredLogConversionBoundary, findBundledScenarioProfile, fullToolTrajectoryConversationFixture, noToolConversationFixture, parseScenarioDefinition, parseScenarioDefinitionJson, receptionistScenarioProfile, representativeTrajectories, retailSupportScenarioProfile, searchTool, searchToolTrajectoryFixture, serializeOpenAIJsonlRows, summarizeOpenAIJsonlRows, toolDecisionConversationFixture, toolTrajectoryFixtures, validateOpenAIJsonl, validateOpenAIFineTuningRow, } from "./core/index.js";
export { assertValidLocaleCode, createAnthropicTranslationAdapter, createOpenAITranslationAdapter, createPseudoTranslationAdapter, createProviderTranslationAdapter, experimentalTranslationRules, translateOpenAIFineTuningRow, translateDatasetExample, translateOpenAIJsonl, } from "./translation/index.js";
export type { AnthropicProviderAdapter, CustomProviderAdapter, ModelClient, ModelInvocationRequest, ModelInvocationResponse, ModelMessage, ModelProviderKind, OpenAIProviderAdapter, OpenAIResponseRequest, ProviderAdapter, ProviderClientOptions, ProviderEnvironment, ProviderErrorOptions, ProviderRuntimeConfig, AnthropicMessageRequest, } from "./providers/index.js";
export { anthropicProviderAdapter, assertSupportedModelProviderKind, createModelClientFromConfig, createProviderAdapter, createUnconfiguredProviderAdapter, defaultApiKeyEnvForProvider, mapAnthropicMessagesResponse, mapModelRequestToAnthropicMessagesRequest, mapModelRequestToOpenAIResponsesRequest, mapOpenAIResponsesResponse, openAIProviderAdapter, ProviderAuthenticationError, ProviderConfigurationError, ProviderError, ProviderRateLimitError, ProviderResponseError, ProviderToolCallError, ProviderUnsupportedFeatureError, resolveProviderClientOptions, } from "./providers/index.js";
export type { DatasetWriter, FileSystemAdapter, ModelBackedPersonaGeneratorOptions, ModelBackedSimulationRunnerOptions, PersonaGenerationRequest, PersonaGenerator, PersistenceAdapter, ScenarioSource, ScenarioSourceInput, SimulationRequest, SimulationRunner, SimulationRuntimeAdapters, ToolResultProvider, ToolResultRequest, } from "./simulation/index.js";
export { buildDeterministicTrajectories, buildDeterministicPersonas, buildToolArguments, createDeferredSimulationRunner, createDeterministicPersonaGenerator, createDeterministicSimulationRunner, createDeterministicToolResultProvider, createModelBackedPersonaGenerator, createModelBackedSimulationRunner, loadScenarioSource, } from "./simulation/index.js";
import type { CliCommandDefinition, PublicWorkflow } from "./core/index.js";
export declare const supportedWorkflows: PublicWorkflow[];
export declare const cliCommands: CliCommandDefinition[];
```

## dist/core/index.d.ts

```ts
export type { AssistantTextMessage, AssistantToolCallMessage, BusinessContext, CliCommandDefinition, ConversationMessage, ConversationTrajectory, ExportMode, FineTuningToolkitConfig, JsonObject, JsonPrimitive, JsonSchemaObject, JsonSchemaValue, JsonValue, PersonaDefinition, PublicWorkflow, ScenarioDefinition, ScenarioPersonaSource, ScenarioStoppingRules, ScenarioToolInventory, SimulatedAssistantTurn, SupportedProvider, SystemMessage, ToolCall, ToolResult, ToolResultMessage, ToolSchema, UserMessage, WorkflowStatus, } from "./model.js";
export { serializeOpenAIJsonlRows, summarizeOpenAIJsonlRows, validateOpenAIJsonl } from "./dataset.js";
export type { DatasetSummary, DatasetValidationIssue, DatasetValidationResult } from "./dataset.js";
export { bundledScenarioProfiles, findBundledScenarioProfile, parseScenarioDefinition, parseScenarioDefinitionJson, receptionistScenarioProfile, retailSupportScenarioProfile, } from "./scenarios.js";
export type { BuildOpenAIRowOptions, OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow, OpenAIToolCall, OpenAIToolDefinition, } from "./openai.js";
export { buildOpenAIFineTuningRow, buildOpenAIFineTuningRows } from "./openai.js";
export { assertValidOpenAIFineTuningRow, validateOpenAIFineTuningRow, type ValidationIssue, type ValidationResult, type ValidationSummary, } from "./validation.js";
export { createDeferredLogConversionError, deferredLogConversionBoundary, type DeferredLogConversionBoundary, } from "./logs.js";
export { bookAppointmentTool, bookAppointmentToolTrajectoryFixture, checkAvailabilityTool, checkAvailabilityToolTrajectoryFixture, fullToolTrajectoryConversationFixture, noToolConversationFixture, representativeTrajectories, searchTool, searchToolTrajectoryFixture, toolDecisionConversationFixture, toolTrajectoryFixtures, } from "./fixtures.js";
export { canonicalSerialize, canonicalSha256, datasetSchemaVersion, withContentHash, type CanonicalMessageV1, type CanonicalRoleV1, type CanonicalToolCallV1, type ContentPartV1, type DatasetExampleV1, type DatasetSplitV1, type DecisionV1, type ProvenanceV1, type TransformationV1, } from "./canonical.js";
export { trajectoryToDatasetExample } from "./trajectory.js";
```

## dist/providers/index.d.ts

```ts
import type { JsonObject, ToolCall, ToolSchema } from "../core/index.js";
import { type ProviderEnvironment, type ProviderRuntimeConfig } from "./config.js";
export type ModelProviderKind = "openai" | "anthropic" | "custom";
export interface ModelMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
    toolCalls?: ToolCall[];
    name?: string;
}
export interface ModelInvocationRequest {
    provider: ModelProviderKind;
    model: string;
    messages: ModelMessage[];
    tools?: ToolSchema[];
    temperature?: number;
    metadata?: JsonObject;
}
export type ModelInvocationResponse = {
    kind: "text";
    content: string;
    metadata?: JsonObject;
} | {
    kind: "tool_calls";
    toolCalls: ToolCall[];
    content?: string;
    metadata?: JsonObject;
};
export interface ModelClient {
    invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse>;
}
export interface ProviderAdapter {
    kind: ModelProviderKind;
    createClient(options: ProviderClientOptions): ModelClient;
}
export interface ProviderClientOptions {
    model: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxOutputTokens?: number;
    headers?: Record<string, string>;
    metadata?: JsonObject;
}
export interface OpenAIProviderAdapter extends ProviderAdapter {
    kind: "openai";
}
export interface AnthropicProviderAdapter extends ProviderAdapter {
    kind: "anthropic";
}
export interface CustomProviderAdapter extends ProviderAdapter {
    kind: "custom";
}
export declare function createUnconfiguredProviderAdapter(kind: ModelProviderKind): ProviderAdapter;
export declare function createProviderAdapter(kind: ModelProviderKind): ProviderAdapter;
export declare function createModelClientFromConfig(config: ProviderRuntimeConfig, env?: ProviderEnvironment): ModelClient;
export { anthropicProviderAdapter } from "./anthropic.js";
export { openAIProviderAdapter } from "./openai.js";
export type { ProviderEnvironment, ProviderRuntimeConfig } from "./config.js";
export { assertSupportedModelProviderKind, defaultApiKeyEnvForProvider, resolveProviderClientOptions, } from "./config.js";
export { ProviderAuthenticationError, ProviderConfigurationError, ProviderError, ProviderRateLimitError, ProviderResponseError, ProviderToolCallError, ProviderUnsupportedFeatureError, } from "./errors.js";
export type { ProviderErrorOptions } from "./errors.js";
export { mapAnthropicMessagesResponse, mapModelRequestToAnthropicMessagesRequest, mapModelRequestToOpenAIResponsesRequest, mapOpenAIResponsesResponse, } from "./mappers.js";
export type { AnthropicMessageRequest, OpenAIResponseRequest } from "./mappers.js";
```

## dist/simulation/index.d.ts

```ts
import type { ConversationTrajectory, ExportMode, FineTuningToolkitConfig, JsonObject, PersonaDefinition, ScenarioDefinition, SimulatedAssistantTurn, ToolCall, ToolResult, ToolSchema } from "../core/index.js";
import type { ModelClient } from "../providers/index.js";
import type { ModelProviderKind } from "../providers/index.js";
export interface FileSystemAdapter {
    readText(path: string): Promise<string>;
    writeText(path: string, contents: string): Promise<void>;
    ensureDirectory(path: string): Promise<void>;
}
export interface DatasetWriter {
    writeJsonl(outputDirectory: string, filename: string, rows: string[]): Promise<void>;
}
export interface PersistenceAdapter {
    put(key: string, value: JsonObject): Promise<void>;
    get(key: string): Promise<JsonObject | undefined>;
}
export interface SimulationRuntimeAdapters {
    modelClient: ModelClient;
    filesystem: FileSystemAdapter;
    persistence?: PersistenceAdapter;
}
export interface ScenarioSource {
    config?: FineTuningToolkitConfig;
    definition: ScenarioDefinition;
    personas?: PersonaDefinition[];
    metadata?: JsonObject;
}
export type ScenarioSourceInput = ScenarioDefinition | {
    definition: ScenarioDefinition;
    config?: FineTuningToolkitConfig;
    personas?: PersonaDefinition[];
    metadata?: JsonObject;
} | {
    bundledProfileId: string;
    config?: FineTuningToolkitConfig;
    metadata?: JsonObject;
} | {
    json: string;
    config?: FineTuningToolkitConfig;
    metadata?: JsonObject;
} | {
    path: string;
    config?: FineTuningToolkitConfig;
    metadata?: JsonObject;
};
export interface SimulationRequest {
    scenario: ScenarioSource;
    outputDirectory: string;
    limit?: number;
    mode?: ExportMode;
}
export interface SimulationRunner {
    run(request: SimulationRequest, adapters?: SimulationRuntimeAdapters): Promise<ConversationTrajectory[]>;
}
export interface AssistantTurnSimulator {
    simulateTurn(trajectory: ConversationTrajectory, adapters: SimulationRuntimeAdapters): Promise<SimulatedAssistantTurn>;
}
export interface PersonaGenerationRequest {
    scenario: ScenarioSource;
    count: number;
}
export interface PersonaGenerator {
    generate(request: PersonaGenerationRequest): Promise<PersonaDefinition[]>;
}
export interface ModelBackedPersonaGeneratorOptions {
    modelClient: ModelClient;
    provider: Exclude<ModelProviderKind, "custom">;
    model: string;
    temperature?: number;
}
export interface ToolResultRequest {
    scenario: ScenarioDefinition;
    persona: PersonaDefinition;
    toolCall: ToolCall;
    tool: ToolSchema;
    trajectoryId: string;
    turnIndex: number;
}
export interface ToolResultProvider {
    source: "deterministic" | "caller";
    getToolResult(request: ToolResultRequest): Promise<ToolResult>;
}
export interface ModelBackedSimulationRunnerOptions {
    modelClient: ModelClient;
    provider: Exclude<ModelProviderKind, "custom">;
    model: string;
    temperature?: number;
    toolResultProvider?: ToolResultProvider;
}
export declare function createDeterministicPersonaGenerator(): PersonaGenerator;
export declare function createModelBackedPersonaGenerator(options: ModelBackedPersonaGeneratorOptions): PersonaGenerator;
export declare function buildDeterministicPersonas(source: ScenarioSource, count: number): PersonaDefinition[];
export declare function createDeterministicToolResultProvider(): ToolResultProvider;
export declare function createDeterministicSimulationRunner(): SimulationRunner;
export declare function createModelBackedSimulationRunner(options: ModelBackedSimulationRunnerOptions): SimulationRunner;
export declare function buildDeterministicTrajectories(scenario: ScenarioDefinition, personas: PersonaDefinition[], mode: ExportMode): ConversationTrajectory[];
export declare function buildToolArguments(tool: ToolSchema): JsonObject;
export declare function createDeferredSimulationRunner(): SimulationRunner;
export declare function loadScenarioSource(input: ScenarioSourceInput, filesystem?: FileSystemAdapter): Promise<ScenarioSource>;
```

## dist/translation/index.d.ts

```ts
import type { DatasetExampleV1 } from "../core/canonical.js";
import type { OpenAIChatFineTuningRow } from "../core/openai.js";
import type { ModelClient, ModelProviderKind } from "../providers/index.js";
export type TranslationWorkflowStatus = "experimental";
export type TranslationRequestPath = "local-pseudo" | "provider-adapter";
export type TranslationProviderKind = ModelProviderKind | "local-pseudo";
export interface TranslationRules {
    systemContent: "translate";
    userContent: "translate";
    assistantContent: "translate";
    assistantToolCalls: "preserve";
    toolResultContent: "preserve";
    toolDefinitions: "preserve";
    metadata: "preserve-with-target-locale";
}
export interface TranslationTextRequest {
    text: string;
    sourceLocale?: string;
    targetLocale: string;
    path: string;
}
export interface TranslationTextAdapter {
    provider: TranslationProviderKind;
    requestPath: TranslationRequestPath;
    model?: string;
    translateText(request: TranslationTextRequest): Promise<string>;
}
export interface ProviderTranslationAdapterOptions {
    temperature?: number;
}
export interface TranslateOpenAIRowOptions {
    targetLocale: string;
    sourceLocale?: string;
    adapter?: TranslationTextAdapter;
}
export interface TranslateOpenAIJsonlOptions extends TranslateOpenAIRowOptions {
}
export interface TranslationResult {
    row: OpenAIChatFineTuningRow;
    rules: TranslationRules;
    provider: TranslationProviderKind;
    requestPath: TranslationRequestPath;
}
export declare function translateDatasetExample(example: DatasetExampleV1, options: TranslateOpenAIRowOptions): Promise<DatasetExampleV1>;
export declare const experimentalTranslationRules: TranslationRules;
export declare function assertValidLocaleCode(locale: string, fieldName?: string): void;
export declare function createPseudoTranslationAdapter(): TranslationTextAdapter;
export declare function createProviderTranslationAdapter(modelClient: ModelClient, provider: Exclude<ModelProviderKind, "custom">, model: string, options?: ProviderTranslationAdapterOptions): TranslationTextAdapter;
export declare function createOpenAITranslationAdapter(modelClient: ModelClient, model: string, options?: ProviderTranslationAdapterOptions): TranslationTextAdapter;
export declare function createAnthropicTranslationAdapter(modelClient: ModelClient, model: string, options?: ProviderTranslationAdapterOptions): TranslationTextAdapter;
export declare function translateOpenAIFineTuningRow(row: OpenAIChatFineTuningRow, options: TranslateOpenAIRowOptions): Promise<TranslationResult>;
export declare function translateOpenAIJsonl(contents: string, options: TranslateOpenAIJsonlOptions): Promise<{
    jsonl: string;
    rows: OpenAIChatFineTuningRow[];
    rules: TranslationRules;
    provider: TranslationProviderKind;
    requestPath: TranslationRequestPath;
}>;
```

## dist/examples/testing.d.ts

```ts
/**
 * Compatibility fixtures intended for examples and tests.
 *
 * Production consumers should prefer the semantic contracts exported from
 * `@amxv/finetuning/core` and avoid depending on these fixed sample values.
 */
export { bookAppointmentTool, bookAppointmentToolTrajectoryFixture, checkAvailabilityTool, checkAvailabilityToolTrajectoryFixture, fullToolTrajectoryConversationFixture, noToolConversationFixture, representativeTrajectories, searchTool, searchToolTrajectoryFixture, toolDecisionConversationFixture, toolTrajectoryFixtures, } from "../core/fixtures.js";
```

## dist/formats/index.d.ts

```ts
/** Stable dataset-format namespace. Codecs are introduced in Phase 2. */
export type { OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow } from "../core/openai.js";
export { serializeOpenAIJsonlRows, validateOpenAIJsonl } from "../core/dataset.js";
export type { CodecId, ConversionLoss, ConversionResult, DatasetCodec } from "./contracts.js";
export { canonicalMessagesCodec, codecRegistry, detectCodec, hfConversationalCodec, hfTextCodec, openAIChatCodec, } from "./codecs.js";
export { JsonlParseError, parseJsonl, serializeJsonl, type JsonlRecord } from "./streaming.js";
```

## dist/formats/openai.d.ts

```ts
/** OpenAI chat JSONL compatibility surface. */
export type { BuildOpenAIRowOptions, OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow, OpenAIToolCall, OpenAIToolDefinition, } from "../core/openai.js";
export { buildOpenAIFineTuningRow, buildOpenAIFineTuningRows } from "../core/openai.js";
export { serializeOpenAIJsonlRows, summarizeOpenAIJsonlRows, validateOpenAIJsonl } from "../core/dataset.js";
export { assertValidOpenAIFineTuningRow, validateOpenAIFineTuningRow } from "../core/validation/messages.js";
```

## dist/validation/index.d.ts

```ts
/** Stable validation namespace. */
export { assertValidOpenAIFineTuningRow, validateOpenAIFineTuningRow, type ValidationIssue, type ValidationResult, type ValidationSummary, } from "../core/validation/messages.js";
export { validateOpenAIJsonl } from "../core/dataset.js";
export { validateDatasetExample, type StagedValidationIssue, type StagedValidationReport, type ValidationIssueCode, type ValidationStage, } from "./canonical.js";
```

## dist/generation/index.d.ts

```ts
/** Stable generation namespace backed by the current simulation compatibility layer. */
export type { ModelBackedPersonaGeneratorOptions, ModelBackedSimulationRunnerOptions, PersonaGenerationRequest, PersonaGenerator, SimulationRequest, SimulationRunner, } from "../simulation/index.js";
export { createDeterministicPersonaGenerator, createDeterministicSimulationRunner, createModelBackedPersonaGenerator, createModelBackedSimulationRunner, } from "../simulation/index.js";
```

## dist/templates/index.d.ts

```ts
/** Reserved stable namespace for late-bound chat templates (Phase 6). */
export declare const templateApiVersion: "0";
```

## dist/training/index.d.ts

```ts
/** Reserved stable namespace for training contracts (Phase 6). */
export declare const trainingApiVersion: "0";
```

## dist/orchestration/index.d.ts

```ts
/** Reserved stable namespace for orchestration contracts (Phase 3). */
export declare const orchestrationApiVersion: "0";
export * from "./contracts.js";
export { LocalDagExecutor } from "./executor.js";
export { freezeDataset, verifyFrozenDataset, type LineageDeletionStore } from "./freeze.js";
export { createStageCacheKey } from "./identity.js";
export { AttemptLedger } from "./ledger.js";
```

## dist/distillation/index.d.ts

```ts
/** Reserved stable namespace for distillation contracts (Phase 5). */
export declare const distillationApiVersion: "0";
```

## dist/node/index.d.ts

```ts
/** Node-specific operational adapters. */
export type { DatasetWriter, FileSystemAdapter, PersistenceAdapter } from "../simulation/index.js";
export { redactSecrets } from "./redaction.js";
export { atomicWrite, ContentAddressedBlobStore, ScopedLock } from "./storage.js";
```
