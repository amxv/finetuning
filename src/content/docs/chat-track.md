---
title: Chat track
description: Create, validate, distill, train, resume, evaluate, and export response datasets.
order: 2
category: Tutorials
---

Chat response distillation transfers a teacher's generated assistant response. It is not embedding distillation: vector distillation transfers geometry, score distillation transfers graded relevance, and ranking distillation transfers ordering.

The retained offline walkthroughs remain the starting point. The complete, command-for-command freeze → explicitly fake-labelled distillation → CPU fixture train → resume → evaluate → export → artifact verification journey is maintained in `docs/alpha-chat-workflows.md` and executed by the docs verifier.

```bash
finetuning dataset freeze --help
finetuning distill init --help
finetuning distill plan --help
finetuning distill responses --help
finetuning training prepare --help
finetuning training run --help
finetuning training resume --help
finetuning training evaluate --help
finetuning training export --help
```

Offline response generation must pass `--offline-fake`; it records `custom/offline-fake`, never a real teacher identity. Provider-backed execution instead requires `--allow-network`, separate credential environment-variable names, and separate positive generation and judging budgets. Production trainer recipes have real Transformers/Datasets/TRL/PEFT execution paths, but remain unavailable until every license, revision, remote-code, GPU, reload, and evaluation gate closes.

Provider calls require an explicit provider, model, credential environment-variable **name**, budget, and network opt-in. Never put a secret in config. Offline deterministic examples do not download or upload anything. `convert-logs` remains deferred: do not treat production logs as accepted or redacted input.

Legacy flat commands (`simulate-dataset`, `validate-dataset`, `generate-personas`, `translate-dataset`) remain compatible. Root and stable subpath imports are additive; experimental preference, remote, logit, and feature workflows carry no stability promise.
