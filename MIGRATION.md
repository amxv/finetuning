# Alpha migration guide

Existing root imports and the `core`, `providers`, `simulation`, and `translation` subpaths remain compatible. Prefer the narrower stable subpaths for new code: `formats`, `formats/openai`, `validation`, `generation`, `templates`, `training`, `orchestration`, `distillation`, and `node`.

Legacy CLI commands remain aliases and keep their behavior:

| Existing command    | Noun-oriented equivalent                                                                |
| ------------------- | --------------------------------------------------------------------------------------- |
| `simulate-dataset`  | `dataset create` (legacy command remains canonical until the noun workflow is complete) |
| `validate-dataset`  | `dataset validate`                                                                      |
| `generate-personas` | `persona generate`                                                                      |
| `translate-dataset` | `dataset translate`                                                                     |

Do not migrate `convert-logs`: it is a discoverable deferred boundary and intentionally rejects input. Provider SDKs are now optional; install `openai` or `@anthropic-ai/sdk` only when selecting that provider. Offline and fake-provider paths need neither.

Serialized contracts use independent major versions. Reject incompatible majors instead of coercing them. Alpha APIs may change with changelog and migration notes; deprecated compatibility shims receive at least one minor release of notice before removal.
