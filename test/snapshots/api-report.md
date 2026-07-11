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
export type { BudgetLimits, CostCatalog, NormalizedFinishReason, NormalizedUsage, ProviderCapabilities, RetryRecord, StructuredOutputRequest, TeacherCandidate, TeacherEnvelope, TeacherRequest, TeacherTransport, } from "./contracts.js";
export { ReliableTeacherProvider, type ReliableProviderOptions } from "./reliable.js";
export { inspectProvider, listProviders, providerCapabilities } from "./registry.js";
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
import type { CanonicalRoleV1 } from "../core/canonical.js";
export declare const templateApiVersion: "1.0.0";
export type Resolution = {
    status: "pinned";
    value: string;
} | {
    status: "unresolved";
    reason: string;
};
export interface ChatTemplateDescriptorV1 {
    id: string;
    family: "qwen3-dense" | "qwen3-moe" | "nemotron-cascade" | "nemotron-nano" | "olmo-instruct" | "olmo-think";
    modelId: string;
    modelRevision: Resolution;
    tokenizerId: string;
    tokenizerRevision: Resolution;
    expectedTemplateHash: Resolution;
    supportedRoles: CanonicalRoleV1[];
    tools: boolean;
    reasoningPolicy: "strip" | "preserve" | "none";
    bos: "exactly-one" | "tokenizer";
    eos: "assistant-turn";
    generationPrompt: boolean;
    liveAudit: "not-run" | "passed" | "failed";
}
export interface ModelRecipeV1 {
    id: string;
    production: boolean;
    templateId: string;
    modelId: string;
    architectureFamily: string;
    modelRevision: Resolution;
    tokenizerRevision: Resolution;
    licenseSnapshot: Resolution;
    testedDependencies: Record<string, string>;
    loraTargetDiscovery: string;
    quantization: ("bf16" | "8bit" | "4bit")[];
    minimumHardware: string;
    task: "sft";
    limitations: string[];
}
export declare const templateRegistry: readonly ChatTemplateDescriptorV1[];
export declare const recipeRegistry: readonly ModelRecipeV1[];
export declare function inspectTemplate(id: string): ChatTemplateDescriptorV1;
export declare function inspectRecipe(id: string): ModelRecipeV1;
export declare function preflightRecipe(id: string): ModelRecipeV1;
```

## dist/training/index.d.ts

```ts
export declare const trainingApiVersion: "1.0.0";
export declare const trainingSpecVersion: "1.0.0";
export declare const trainingEventVersion: "1.0.0";
export declare const artifactManifestVersion: "1.0.0";
export interface TrainingSpecV1 {
    trainingSpecVersion: typeof trainingSpecVersion;
    runId: string;
    dataset: {
        manifestPath: string;
        recordsHash: string;
    };
    recipeId: string;
    outputDirectory: string;
    objective: "sft";
    seed: number;
    operation?: "prepare" | "run" | "resume" | "status" | "evaluate" | "export";
    checkpointPath?: string;
    quantization?: "4bit" | "8bit" | "bf16";
}
export interface TrainingEventV1 {
    trainingEventVersion: typeof trainingEventVersion;
    sequence: number;
    timestamp: string;
    runId: string;
    type: "started" | "preflight" | "progress" | "artifact" | "completed" | "failed";
    data?: Record<string, unknown>;
}
export interface ArtifactManifestV1 {
    artifactManifestVersion: typeof artifactManifestVersion;
    runId: string;
    createdAt: string;
    artifacts: Array<{
        path: string;
        sha256: string;
        bytes: number;
        kind: string;
    }>;
    trainingSpecHash: string;
}
export declare function assertCompatibleMajor(actual: string, expected: string, contract: string): void;
export declare function parseTrainingSpec(value: unknown): TrainingSpecV1;
export declare function parseTrainingEvent(value: unknown): TrainingEventV1;
export declare function parseArtifactManifest(value: unknown): ArtifactManifestV1;
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
import { type CanonicalMessageV1, type DatasetExampleV1, type DatasetSplitV1, type DecisionV1 } from "../core/canonical.js";
import type { NormalizedUsage, TeacherEnvelope, TeacherRequest } from "../providers/contracts.js";
export declare const distillationApiVersion: "1.0.0";
export declare const distillationRecordVersion: "1.0.0";
export type DistillationStage = "ingest" | "groups" | "quota" | "responses" | "validate" | "policy" | "verify" | "judge" | "filter" | "dedupe" | "split" | "contamination" | "freeze";
export interface DistillationCandidateV1 {
    id: string;
    messages: CanonicalMessageV1[];
    generator: {
        provider: string;
        model: string;
        requestId: string;
        sampleId: string;
    };
    usage: NormalizedUsage;
    createdAt: string;
}
export interface DistillationDecisionV1 extends DecisionV1 {
    stage: DistillationStage;
    candidateId?: string;
    createdAt: string;
    scores?: Record<string, number>;
    audit?: {
        judgments: Array<{
            requestId: string;
            candidateLabel: "A" | "B";
            referenceLabel: "A" | "B";
            scores: Record<string, number>;
        }>;
    };
}
export interface DistillationRecordV1 {
    distillationRecordVersion: typeof distillationRecordVersion;
    id: string;
    source: DatasetExampleV1;
    taxonomy: string[];
    quotaBucket?: string;
    locked: boolean;
    candidates: DistillationCandidateV1[];
    decisions: DistillationDecisionV1[];
    dedupe?: {
        exact?: string;
        minhash?: string;
        semantic?: string;
        representative: boolean;
        rationale: string;
    };
    split?: DatasetSplitV1;
    contamination?: string[];
}
export interface ComplianceAttestationsV1 {
    sourceRights: {
        status: "approved";
        basis: string;
    };
    teacherTerms: {
        url: string;
        version: string;
        reviewedAt: string;
        approver: string;
    };
    intendedUse: string;
    retentionPolicy: string;
    reasoningPolicy: string;
    studentLicense: {
        id: string;
        version: string;
    };
}
export interface QuotaRule {
    taxonomy: string;
    target: number;
}
export interface DistillationConfig {
    runId: string;
    salt: string;
    generator: {
        provider: "openai" | "anthropic";
        model: string;
    };
    judge?: {
        provider: "openai" | "anthropic";
        model: string;
        orderSwap?: boolean;
    };
    compliance: ComplianceAttestationsV1;
    quotas?: QuotaRule[];
    splits?: {
        train: number;
        validation: number;
        test: number;
    };
    lexicalOnly?: boolean;
    minhashThreshold?: number;
    judgeThreshold?: number;
}
export interface DistillationProvider {
    generate(request: TeacherRequest): Promise<TeacherEnvelope>;
}
export interface EmbeddingDedupePlugin {
    id: string;
    embed(texts: string[]): Promise<number[][]>;
    threshold: number;
}
export interface DistillationCostReport {
    generator: NormalizedUsage;
    judge: NormalizedUsage;
    totalCost: number;
    currency: string;
}
export interface DistillationPlan {
    runId: string;
    stageCounts: Record<DistillationStage, number>;
    quotas: Array<QuotaRule & {
        available: number;
        deficit: number;
    }>;
    lockedCount: number;
    generationCount: number;
    compliance: "approved";
}
export interface DistillationRunState {
    version: "1.0.0";
    config: DistillationConfig;
    records: DistillationRecordV1[];
    completedStages: DistillationStage[];
    paidSuccesses: Record<string, TeacherEnvelope>;
    costs: DistillationCostReport;
    createdAt: string;
    updatedAt: string;
}
export declare function validateCompliance(value: ComplianceAttestationsV1): void;
export declare function planDistillation(input: DatasetExampleV1[], config: DistillationConfig): DistillationPlan;
export declare function scanSensitive(text: string): Array<{
    kind: "pii" | "secret";
    match: string;
}>;
export declare class DistillationPipeline {
    readonly provider: DistillationProvider;
    readonly judgeProvider: DistillationProvider;
    readonly embedding?: EmbeddingDedupePlugin | undefined;
    readonly now: () => string;
    readonly checkpoint?: ((state: DistillationRunState) => Promise<void>) | undefined;
    constructor(provider: DistillationProvider, judgeProvider?: DistillationProvider, embedding?: EmbeddingDedupePlugin | undefined, now?: () => string, checkpoint?: ((state: DistillationRunState) => Promise<void>) | undefined);
    run(input: DatasetExampleV1[], config: DistillationConfig, previous?: DistillationRunState): Promise<DistillationRunState>;
}
export declare function saveDistillationState(root: string, state: DistillationRunState): Promise<void>;
export declare function loadDistillationState(root: string): Promise<DistillationRunState>;
export declare function distillationDataset(state: DistillationRunState): DatasetExampleV1[];
```

## dist/embeddings/index.d.ts

```ts
export * from "../experimental/embeddings-phase11.js";
export * from "./formats.js";
export * from "./data.js";
export * from "./distillation.js";
export * from "./sdk.js";
export { embeddingModelRegistry, embeddingRecipeRegistry, EmbeddingTrainingRun, inspectEmbeddingArtifact, } from "./training.js";
export { EmbeddingEvaluator, evaluateEmbeddingSpec, verifyEmbeddingEvaluationReport, evaluationForModelCard, retrievalMetrics, pearson, spearman, classificationMetrics, vMeasure, bootstrap, } from "./evaluation.js";
export type { EmbeddingTrainingSpecV1, EmbeddingModelDescriptor, EmbeddingRecipeDescriptor } from "./training.js";
export type { EmbeddingEvaluationSpecV1, EmbeddingEvaluationReport } from "./evaluation.js";
```

## dist/embeddings/formats.d.ts

```ts
import { type DatasetSplitV1 } from "../core/canonical.js";
import { type EmbeddingRecordV1 } from "../experimental/embeddings-phase11.js";
export type EmbeddingFormat = "canonical-embedding-jsonl" | "sentence-transformers" | "hugging-face";
export type EmbeddingTaskMapping = "pair" | "triplet" | "retrieval-set" | "scored-pair" | "sts" | "boolean-pair" | "categorical-pair" | "classification" | "clustering" | "instruction-aware" | "teacher-vector" | "teacher-score" | "teacher-ranking";
export interface EmbeddingColumnMapping {
    task: EmbeddingTaskMapping;
    columns: Record<string, string>;
}
export interface EmbeddingCodecOptions {
    mapping?: EmbeddingColumnMapping;
    source?: {
        name: string;
        revision: string;
        license: string;
        rights: string;
    };
    split?: DatasetSplitV1;
    splitGroupColumn?: string;
    language?: string;
    domain?: string;
}
export interface EmbeddingLoss {
    code: string;
    path: string;
    message: string;
    severity: "warning" | "error";
}
export interface EmbeddingConversion<T> {
    value?: T;
    losses: EmbeddingLoss[];
    supported: boolean;
}
export declare function detectEmbeddingTask(row: Record<string, unknown>, mapping?: EmbeddingColumnMapping): EmbeddingTaskMapping;
export declare function decodeEmbeddingRow(row: Record<string, unknown>, options?: EmbeddingCodecOptions): EmbeddingConversion<EmbeddingRecordV1>;
export declare function encodeEmbeddingRow(record: EmbeddingRecordV1, format: EmbeddingFormat, mapping?: EmbeddingColumnMapping): EmbeddingConversion<Record<string, unknown>>;
```

## dist/embeddings/distillation.d.ts

```ts
import { type EmbeddingRecordV1, type EmbeddingTextV1 } from "../experimental/embeddings-phase11.js";
export declare const embeddingDistillationVersion: "1.0.0";
export interface EmbeddingServiceCapabilities {
    tasks: string[];
    storageAllowed: boolean;
    retention: "none" | "temporary" | "persistent";
    competitiveTrainingAllowed: boolean;
    maxDimension?: number;
    matryoshkaDimensions?: number[];
}
export interface ServiceUsage {
    requests: number;
    units: number;
    cost: number;
    currency: string;
    rawRequestRef?: string;
    rawResponseRef?: string;
}
export interface EmbeddingTeacher {
    readonly id: string;
    readonly model: string;
    readonly revision: string;
    capabilities(): EmbeddingServiceCapabilities;
    embed(input: {
        requestId: string;
        texts: EmbeddingTextV1[];
        dimension: number;
    }): Promise<{
        vectors: number[][];
        dtype: "float16" | "float32" | "bfloat16";
        norm: "l2" | "none";
        pooling: string;
        prompt: string;
        usage: ServiceUsage;
    }>;
}
export interface EmbeddingScorer {
    readonly id: string;
    readonly model: string;
    readonly revision: string;
    capabilities(): EmbeddingServiceCapabilities;
    score(input: {
        requestId: string;
        query: EmbeddingTextV1;
        candidates: EmbeddingTextV1[];
    }): Promise<{
        scores: number[];
        scale: {
            min: number;
            max: number;
            direction: "higher-is-more-relevant" | "lower-is-more-relevant";
        };
        usage: ServiceUsage;
    }>;
}
export interface EmbeddingRanker {
    readonly id: string;
    readonly model: string;
    readonly revision: string;
    capabilities(): EmbeddingServiceCapabilities;
    rank(input: {
        requestId: string;
        query: EmbeddingTextV1;
        candidates: EmbeddingTextV1[];
    }): Promise<{
        ranking: string[];
        scores: number[];
        prompt: string;
        configuration: Record<string, unknown>;
        usage: ServiceUsage;
    }>;
}
export interface SyntheticEmbeddingGenerator {
    readonly id: string;
    capabilities(): EmbeddingServiceCapabilities;
    generate(input: {
        requestId: string;
        document: EmbeddingTextV1;
        intent: string;
        language: string;
    }): Promise<{
        query: string;
        usage: ServiceUsage;
    }>;
}
export interface NegativeMiner {
    readonly id: string;
    readonly revision: string;
    mine(input: {
        requestId: string;
        query: EmbeddingTextV1;
        corpus: EmbeddingTextV1[];
        limit: number;
    }): Promise<{
        candidateIds: string[];
        usage: ServiceUsage;
    }>;
}
export interface EmbeddingVerifier {
    verify(input: {
        query: EmbeddingTextV1;
        document: EmbeddingTextV1;
    }): Promise<{
        supported: boolean;
        reason: string;
    }>;
}
export interface EmbeddingJudge {
    judge(input: {
        query: EmbeddingTextV1;
        document: EmbeddingTextV1;
        score: number;
    }): Promise<{
        accepted: boolean;
        reason: string;
        usage: ServiceUsage;
    }>;
}
export type DistillationObjective = {
    kind: "mse" | "cosine";
    projection?: {
        kind: "learned" | "pca";
        fitSplit: "train";
        artifactHash: string;
    };
    dimensions?: number[];
} | {
    kind: "margin-mse" | "pairwise-logistic" | "pairwise-kl";
} | {
    kind: "listwise-kl";
    temperature: number;
};
export interface EmbeddingDistillationCompliance {
    datasetRights: string;
    teacherOutputRights: string;
    terms: {
        url: string;
        version: string;
        reviewedAt: string;
        approver: string;
    };
    retentionAllowed: "none" | "temporary" | "persistent";
    intendedUse: string;
    contaminationHash: string;
}
export interface StageBudget {
    limit: number;
    spent: number;
    usage: ServiceUsage;
}
export type BudgetStage = "generation" | "scoring" | "judging" | "mining" | "vectors" | "ranking";
export interface EmbeddingDistillationConfig {
    runId: string;
    dimension: number;
    objective: DistillationObjective;
    budgets: Record<BudgetStage, number>;
    compliance: EmbeddingDistillationCompliance;
    nearDuplicateThreshold: number;
    candidateLimit: number;
    refresh?: {
        kind: "checkpoint" | "epoch";
        values: number[];
    };
    teacherStorageRights: string;
    seed: string;
}
export interface PaidResult {
    identity: string;
    stage: BudgetStage;
    requestId: string;
    result: unknown;
    usage: ServiceUsage;
}
export interface EmbeddingDistillationState {
    version: typeof embeddingDistillationVersion;
    configHash: string;
    completedStages: string[];
    records: EmbeddingRecordV1[];
    paidSuccesses: Record<string, PaidResult>;
    budgets: Record<BudgetStage, StageBudget>;
    events: Array<{
        sequence: number;
        stage: string;
        kind: string;
        recordId?: string;
    }>;
    exclusions: Array<{
        queryId: string;
        candidateId: string;
        reason: string;
    }>;
    createdAt: string;
    updatedAt: string;
}
export declare function validateEmbeddingDistillationConfig(config: EmbeddingDistillationConfig, services: EmbeddingServiceCapabilities[]): void;
export declare function marginMse(studentPositive: number, studentNegative: number, teacherPositive: number, teacherNegative: number): number;
export declare function pairwiseLogisticLoss(positive: number, negative: number): number;
export declare function listwiseKl(student: number[], teacher: number[], temperature: number): number;
export declare class EmbeddingDistillationPipeline {
    readonly services: {
        teacher: EmbeddingTeacher;
        scorer: EmbeddingScorer;
        ranker: EmbeddingRanker;
        generator: SyntheticEmbeddingGenerator;
        miner: NegativeMiner;
        verifier: EmbeddingVerifier;
        judge: EmbeddingJudge;
    };
    readonly now: () => string;
    readonly checkpoint?: ((s: EmbeddingDistillationState) => Promise<void>) | undefined;
    constructor(services: {
        teacher: EmbeddingTeacher;
        scorer: EmbeddingScorer;
        ranker: EmbeddingRanker;
        generator: SyntheticEmbeddingGenerator;
        miner: NegativeMiner;
        verifier: EmbeddingVerifier;
        judge: EmbeddingJudge;
    }, now?: () => string, checkpoint?: ((s: EmbeddingDistillationState) => Promise<void>) | undefined);
    run(input: EmbeddingRecordV1[], config: EmbeddingDistillationConfig, previous?: EmbeddingDistillationState): Promise<EmbeddingDistillationState>;
}
export declare function saveEmbeddingDistillationState(path: string, state: EmbeddingDistillationState): Promise<void>;
export declare function loadEmbeddingDistillationState(path: string): Promise<EmbeddingDistillationState>;
```

## dist/embeddings/training.d.ts

```ts
import { TypedRegistry, type EmbeddingServiceDependencies } from "./sdk.js";
export declare const embeddingTrainingSpecVersion: "embedding.training.v1";
export declare const embeddingTrainingEventVersion: "embedding.training.event.v1";
export declare const embeddingArtifactVersion: "embedding.training.artifact.v1";
export interface EmbeddingTrainingSpecV1 {
    embeddingTrainingSpecVersion: typeof embeddingTrainingSpecVersion;
    runId: string;
    datasetManifest: string;
    recipeId: string;
    objective: "contrastive" | "multiple-negatives" | "cosine" | "margin";
    outputDirectory: string;
    effectiveBatchSize: number;
    dimension?: number;
    adapter?: "lora" | "full";
    seed?: number;
    immutableIdentity: {
        modelRevision: string;
        tokenizerRevision: string;
        configRevision: string;
        dataHash: string;
        splitHash: string;
        taskMapping: unknown;
        prompts: unknown;
        pooling: string;
        padding: string;
        normalization: unknown;
        dimensions: number[];
        objective: string;
        seed: number;
    };
    allowedRuntimeChanges?: string[];
}
export interface EmbeddingTrainingEventV1 {
    embeddingTrainingEventVersion: typeof embeddingTrainingEventVersion;
    sequence: number;
    timestamp: string;
    runId: string;
    type: "started" | "preflight" | "progress" | "checkpoint" | "artifact" | "completed" | "failed";
    data?: Record<string, unknown>;
}
export interface EmbeddingArtifactManifestV1 {
    embeddingArtifactVersion: typeof embeddingArtifactVersion;
    runId: string;
    specHash: string;
    artifacts: Array<{
        path: string;
        sha256: string;
        bytes: number;
        kind: string;
    }>;
}
export declare function assertEmbeddingContractMajor(actual: string, expected: string, contract: string): void;
export interface EmbeddingModelDescriptor {
    id: string;
    status: "unavailable" | "available";
    reason: string;
    evidence: string[];
    dimensions: readonly number[];
}
export interface EmbeddingRecipeDescriptor {
    id: string;
    modelId: string;
    status: "unavailable" | "available";
    reason: string;
    objective: string;
}
export declare const embeddingModelRegistry: TypedRegistry<EmbeddingModelDescriptor>;
export declare const embeddingRecipeRegistry: TypedRegistry<EmbeddingRecipeDescriptor>;
export declare function validateEmbeddingTrainingSpec(value: EmbeddingTrainingSpecV1): EmbeddingTrainingSpecV1;
export declare class EmbeddingTrainingRun {
    readonly spec: EmbeddingTrainingSpecV1;
    private readonly dependencies;
    constructor(spec: EmbeddingTrainingSpecV1, dependencies?: EmbeddingServiceDependencies);
    plan(): {
        spec: EmbeddingTrainingSpecV1;
        recipe: EmbeddingRecipeDescriptor;
        executable: boolean;
        network: boolean;
        uploads: boolean;
        trustRemoteCode: boolean;
        planHash: string;
    };
    run(): Promise<unknown>;
}
export declare function inspectEmbeddingArtifact(path: string): Promise<{
    manifest: EmbeddingArtifactManifestV1;
    verified: boolean;
}>;
```

## dist/embeddings/evaluation.d.ts

```ts
import { type EmbeddingServiceDependencies } from "./sdk.js";
export declare const embeddingEvaluationSpecVersion: "embedding.evaluation.v1", embeddingEvaluationReportVersion: "embedding.evaluation.report.v1";
export interface RankedQuery {
    id: string;
    relevantIds: string[];
    candidates: Array<{
        id: string;
        score: number;
    }>;
    language?: string;
    prompt?: "on" | "off";
    length?: number;
    dimension?: number;
}
export interface EmbeddingEvaluationSpecV1 {
    embeddingEvaluationSpecVersion: typeof embeddingEvaluationSpecVersion;
    runId: string;
    datasetRevision: string;
    evaluatorRevision: string;
    mteb?: {
        revision: string;
        taskSet: string;
        offlineFixture: boolean;
    };
    frozenSplitHash: string;
    contaminationHash: string;
    artifactManifest?: string;
    outputPath?: string;
    retrieval?: RankedQuery[];
    sts?: Array<{
        predicted: number;
        expected: number;
        language?: string;
    }>;
    classification?: Array<{
        predicted: string;
        expected: string;
        language?: string;
    }>;
    clustering?: Array<{
        predicted: string;
        expected: string;
        language?: string;
    }>;
    baselines?: Record<string, Record<string, number>>;
    thresholds?: Array<{
        metric: string;
        baseline: string;
        minimumDelta?: number;
        minimum?: number;
        maximum?: number;
    }>;
    resources?: {
        latencyMs: number;
        throughputPerSecond: number;
        peakMemoryBytes: number;
        artifactBytes: number;
    };
    contamination?: {
        evalIds: string[];
        generationLedgerIds: string[];
        miningLedgerIds: string[];
        canaries: string[];
        projectionFitSplit: "train";
    };
    bootstrap?: {
        seed: number;
        samples: number;
    };
}
export interface MetricInterval {
    value: number;
    low: number;
    high: number;
}
export interface EmbeddingEvaluationReport {
    embeddingEvaluationReportVersion: typeof embeddingEvaluationReportVersion;
    runId: string;
    status: "complete";
    comparable: boolean;
    metrics: Record<string, number>;
    intervals: Record<string, MetricInterval>;
    slices: Record<string, Record<string, number>>;
    baselines: Record<string, Record<string, number>>;
    regression: {
        passed: boolean;
        failures: string[];
    };
    resources?: EmbeddingEvaluationSpecV1["resources"];
    revisions: {
        dataset: string;
        evaluator: string;
        mteb?: string;
        taskSet?: string;
    };
    raw: {
        retrieval?: RankedQuery[];
    };
    contamination: {
        passed: boolean;
        teacherLimitation: string;
    };
    reportHash: string;
}
export declare function retrievalMetrics(rows: RankedQuery[], k?: number): {
    [x: string]: number;
    mrr: number;
    "ndcg@10": number;
};
export declare function pearson(a: number[], b: number[]): number;
export declare const spearman: (a: number[], b: number[]) => number;
export declare function classificationMetrics(rows: Array<{
    predicted: string;
    expected: string;
}>): {
    accuracy: number;
    "macro-f1": number;
};
export declare function vMeasure(rows: Array<{
    predicted: string;
    expected: string;
}>): number;
export declare function bootstrap(values: number[], seed: number, samples: number): MetricInterval;
export declare function evaluateEmbeddingSpec(spec: EmbeddingEvaluationSpecV1): EmbeddingEvaluationReport;
export declare function verifyEmbeddingEvaluationReport(path: string): Promise<EmbeddingEvaluationReport>;
export declare function evaluationForModelCard(path: string): Promise<{
    reportHash: string;
    evaluatorRevision: string;
    datasetRevision: string;
    metrics: Record<string, number>;
    regressionPassed: boolean;
}>;
export declare class EmbeddingEvaluator {
    private readonly dependencies;
    constructor(dependencies?: EmbeddingServiceDependencies);
    plan(spec: EmbeddingEvaluationSpecV1): {
        spec: EmbeddingEvaluationSpecV1;
        executable: boolean;
        network: boolean;
    };
    evaluate(spec: EmbeddingEvaluationSpecV1): Promise<EmbeddingEvaluationReport>;
}
```

## dist/node/index.d.ts

```ts
/** Node-specific operational adapters. */
export type { DatasetWriter, FileSystemAdapter, PersistenceAdapter } from "../simulation/index.js";
export { redactSecrets } from "./redaction.js";
export { atomicWrite, ContentAddressedBlobStore, ScopedLock } from "./storage.js";
export { runPythonTrainer, type TrainerBridgeOptions, type TrainerRunResult } from "./trainer.js";
export { runPythonEmbeddingTrainer, type EmbeddingTrainerBridgeOptions } from "./embedding-trainer.js";
```
