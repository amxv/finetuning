# Experimental local advanced distillation

Preference, logit, and feature distillation are post-MVP experimental surfaces. Import them only from `@amxv/finetuning/experimental/advanced-distillation`; they are intentionally absent from the stable root.

Preference records preserve prompt, chosen and rejected candidate hashes, generator and judge request provenance, decisions, grouping, leakage groups, and splits. DPO and ORPO accept only `preference-pairs`. Local logit plugins accept bounded top-k probabilities plus residual mass and require exact tokenizer/vocabulary identity or an explicit one-to-one vocabulary mapping. Local feature plugins require named teacher/student layers, masks, pooling and loss declarations, compatible projection dimensions, and content-addressed tensor blobs.

OpenAI, Anthropic, and other response-only black-box teachers cannot claim logits or hidden features. The SDK fails with `ADVANCED_CAPABILITY_UNSUPPORTED` and directs callers to an explicitly local teacher plugin; it never reconstructs these signals from sampled text.

Plugin checkpoints bind immutable objective, tokenizer/vocabulary or layer/projection configuration. Resume rejects changes, tensor storage is bounded, and artifact hashes are verified before consumption. Normal response distillation remains the default stable workflow.
