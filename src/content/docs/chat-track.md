---
title: Chat track
description: Create, validate, distill, train, resume, evaluate, and export response datasets.
order: 2
category: Chat
---

Chat response distillation transfers a teacher's generated assistant response. It is not embedding distillation: vector distillation transfers geometry, score distillation transfers graded relevance, and ranking distillation transfers ordering.

The retained offline walkthroughs remain the starting point: [Quickstart](/docs/quickstart) creates deterministic conversations and [Full tool trajectories](/docs/full-tool-trajectories) explains tool calls and results. Validate before training. The noun-oriented continuation is:

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

Provider calls require an explicit provider, model, credential environment-variable **name**, budget, and network opt-in. Never put a secret in config. Offline deterministic examples do not download or upload anything. `convert-logs` remains deferred: do not treat production logs as accepted or redacted input.

Legacy flat commands (`simulate-dataset`, `validate-dataset`, `generate-personas`, `translate-dataset`) remain compatible. Root and stable subpath imports are additive; experimental preference, remote, logit, and feature workflows carry no stability promise.

