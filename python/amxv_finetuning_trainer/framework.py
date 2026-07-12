"""Dependency-backed training architecture. Imports heavy frameworks only after explicit gates."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Protocol

from .checkpoints import checkpoint_inventory, checkpoint_step

try:
    import torch

    _Module = torch.nn.Module
except ImportError:
    torch = None
    _Module = object


class FrameworkAdapter(Protocol):
    def load_tokenizer(self, model_id: str, revision: str, trust_remote_code: bool = False) -> Any: ...
    def load_model(
        self, model_id: str, revision: str, *, quantization: str, trust_remote_code: bool = False
    ) -> Any: ...
    def prepare_chat(self, rows: list[dict[str, Any]], tokenizer: Any) -> Any: ...
    def prepare_embedding(
        self, rows: list[dict[str, Any]], tokenizer: Any, recipe: dict[str, Any]
    ) -> tuple[Any, Any]: ...
    def attach_adapter(self, model: Any, config: dict[str, Any]) -> Any: ...
    def train_sft(self, model: Any, tokenizer: Any, dataset: Any, config: dict[str, Any]) -> Any: ...
    def train_embedding(self, model: Any, tokenizer: Any, dataset: Any, config: dict[str, Any]) -> Any: ...
    def save(self, trainer: Any, output: Path, *, adapter_only: bool) -> list[str]: ...


class HuggingFaceFramework:
    """Real Transformers/Datasets/TRL/PEFT wiring; never imported or invoked implicitly."""

    def __init__(self):
        try:
            from datasets import Dataset
            from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
            from transformers import (
                AutoModel,
                AutoModelForCausalLM,
                AutoTokenizer,
                BitsAndBytesConfig,
                Trainer,
                TrainingArguments,
            )
            from trl import SFTConfig, SFTTrainer
        except ImportError as e:
            raise RuntimeError("TRAINING_DEPENDENCY_MISSING: install amxv-finetuning-trainer[training]") from e
        self.AutoModel, self.AutoModelForCausalLM, self.AutoTokenizer = AutoModel, AutoModelForCausalLM, AutoTokenizer
        self.BitsAndBytesConfig, self.TrainingArguments = BitsAndBytesConfig, TrainingArguments
        self.Dataset, self.LoraConfig, self.get_peft_model = Dataset, LoraConfig, get_peft_model
        self.prepare_model_for_kbit_training = prepare_model_for_kbit_training
        self.SFTConfig, self.SFTTrainer, self.Trainer = SFTConfig, SFTTrainer, Trainer

    def load_tokenizer(self, model_id, revision, trust_remote_code=False):
        return self.AutoTokenizer.from_pretrained(model_id, revision=revision, trust_remote_code=trust_remote_code)

    def load_model(self, model_id, revision, *, quantization, trust_remote_code=False, track="chat"):
        kwargs = {"revision": revision, "trust_remote_code": trust_remote_code}
        if quantization == "4bit":
            kwargs["quantization_config"] = self.BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
        cls = self.AutoModel if track == "embedding" else self.AutoModelForCausalLM
        model = cls.from_pretrained(model_id, **kwargs)
        if quantization == "4bit":
            model = self.prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
            model.config.use_cache = False
        return model

    def prepare_chat(self, rows, tokenizer):
        prepared = []
        for row in rows:
            ids, labels = manual_assistant_labels(tokenizer, row["messages"])
            prepared.append({"input_ids": ids, "attention_mask": [1] * len(ids), "labels": labels})
        return self.Dataset.from_list(prepared)

    def prepare_embedding(self, rows, tokenizer, recipe):
        def encode(text):
            return tokenizer(text, truncation=True, max_length=recipe["maxLength"])

        def query_text(row):
            prefix = recipe.get("queryPrefix", "")
            if "{task}" in prefix:
                task = row.get("task") or recipe.get("queryTask")
                if not task or "\n" in task:
                    raise ValueError("EMBED_QUERY_TASK_REQUIRED: expected one sentence")
                prefix = prefix.replace("{task}", task)
            return prefix + row["query"]

        prepared = [
            {
                "query": encode(query_text(r)),
                "document": encode(recipe.get("documentPrefix", "") + r["document"]),
                **(
                    {"hard_negative": encode(recipe.get("documentPrefix", "") + r["hardNegative"])}
                    if r.get("hardNegative")
                    else {}
                ),
            }
            for r in rows
        ]

        def collate(batch):
            sides = ["query", "document"]
            if all("hard_negative" in x for x in batch):
                sides.append("hard_negative")
            return {side: tokenizer.pad([x[side] for x in batch], return_tensors="pt") for side in sides}

        return self.Dataset.from_list(prepared), collate

    def wrap_embedding(self, model, recipe, dimension=None):
        dimensions = [dimension] if dimension is not None else recipe.get("dimensions", [])
        return BiEncoder(
            model,
            recipe["pooling"],
            dimensions=dimensions,
            normalize=recipe.get("normalization") == "l2",
            temperature=recipe.get("temperature", 0.05),
        )

    def attach_adapter(self, model, config):
        target_modules = config.get("target_modules", [])
        if target_modules and hasattr(model, "named_modules"):
            names = [name for name, _ in model.named_modules()]
            missing = [target for target in target_modules if not any(name.endswith(target) for name in names)]
            if missing:
                raise RuntimeError("LORA_TARGET_DISCOVERY_MISMATCH: " + ", ".join(missing))
        return self.get_peft_model(model, self.LoraConfig(**config))

    def train_sft(self, model, tokenizer, dataset, config):
        args = dict(config)
        resume = args.pop("resume_from_checkpoint", None)
        trainer = self.SFTTrainer(
            model=model, processing_class=tokenizer, train_dataset=dataset, args=self.SFTConfig(**args)
        )
        trainer.train(resume_from_checkpoint=resume)
        return trainer

    def train_embedding(self, model, tokenizer, dataset, config):
        args = dict(config)
        collator = args.pop("data_collator")
        resume = args.pop("resume_from_checkpoint", None)
        args.setdefault("remove_unused_columns", False)
        trainer = self.Trainer(
            model=model, train_dataset=dataset, data_collator=collator, args=self.TrainingArguments(**args)
        )
        trainer.train(resume_from_checkpoint=resume)
        return trainer

    def save(self, trainer, output, *, adapter_only):
        output.mkdir(parents=True, exist_ok=True)
        trainer.save_model(str(output))
        trainer.tokenizer.save_pretrained(str(output)) if getattr(trainer, "tokenizer", None) else None
        return sorted(p.name for p in output.iterdir())


def require_execution_gates(spec: dict[str, Any]) -> None:
    gates = spec.get("executionGates", {})
    required = ["allowModelLoad", "licenseApproved", "revisionPinned", "remoteCodeReviewed", "gpuQualified"]
    if spec.get("qualificationSchemaVersion") == "2.0.0":
        required.extend(
            [
                "networkApproved",
                "downloadsApproved",
                "budgetApproved",
                "datasetRightsApproved",
                "uploadApproved",
                "architectureQualified",
                "frameworkQualified",
                "customKernelApproved",
            ]
        )
    missing = [k for k in required if gates.get(k) is not True]
    if missing:
        raise RuntimeError("PRODUCTION_GATE_CLOSED: " + ", ".join(missing))
    if spec.get("trustRemoteCode") and not gates.get("remoteCodeReviewed"):
        raise RuntimeError("REMOTE_CODE_REVIEW_REQUIRED")


RECIPES = {
    "qwen3.6-27b": {
        "track": "chat",
        "modelId": "Qwen/Qwen3.6-27B",
        "modelRevision": "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
        "tokenizerRevision": "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
        "architecture": "hybrid-dense",
        "reasoning": "unified",
        "roles": ["system", "user", "assistant", "tool"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
    },
    "qwen3.6-35b-a3b": {
        "track": "chat",
        "modelId": "Qwen/Qwen3.6-35B-A3B",
        "modelRevision": "995ad96eacd98c81ed38be0c5b274b04031597b0",
        "tokenizerRevision": "995ad96eacd98c81ed38be0c5b274b04031597b0",
        "architecture": "hybrid-moe",
        "reasoning": "unified",
        "roles": ["system", "user", "assistant", "tool"],
        "blocked": "not authorized in first smoke wave; packed expert target_parameters unresolved",
    },
    "nemotron-cascade-2-30b-a3b": {
        "track": "chat",
        "modelId": "nvidia/Nemotron-Cascade-2-30B-A3B",
        "modelRevision": "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7",
        "tokenizerRevision": "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7",
        "architecture": "custom-nemotron-h",
        "reasoning": "thinking-policy-required",
        "roles": ["system", "user", "assistant", "tool"],
        "blocked": "not authorized in first smoke wave; NVIDIA license artifact, remote code, Mamba kernels, and dedicated adapter unresolved",
    },
    "nemotron-3-nano-30b-a3b": {
        "track": "chat",
        "modelId": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
        "modelRevision": "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
        "tokenizerRevision": "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
        "architecture": "mamba-transformer-moe",
        "reasoning": "explicit",
        "roles": ["system", "user", "assistant", "tool"],
        "blocked": "not authorized in first smoke wave; NVIDIA license artifact, remote code, Mamba kernels, and dedicated adapter unresolved",
    },
    "olmo-3.1-32b-instruct": {
        "track": "chat",
        "modelId": "allenai/Olmo-3.1-32B-Instruct",
        "modelRevision": "ac0587e4a7744a551c059d8cd17ba220bc940dae",
        "tokenizerRevision": "ac0587e4a7744a551c059d8cd17ba220bc940dae",
        "architecture": "dense",
        "reasoning": "instruct",
        "roles": ["system", "user", "assistant", "tool"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
    },
    "olmo-3.1-32b-think": {
        "track": "chat",
        "modelId": "allenai/Olmo-3.1-32B-Think",
        "modelRevision": "832c3f543499af8fe68b88359501de9cb7840544",
        "tokenizerRevision": "832c3f543499af8fe68b88359501de9cb7840544",
        "architecture": "dense",
        "reasoning": "think",
        "roles": ["system", "user", "assistant"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
    },
    "qwen3-embed-0.6b-lora": {
        "track": "embedding",
        "modelId": "Qwen/Qwen3-Embedding-0.6B",
        "modelRevision": "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3",
        "tokenizerRevision": "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3",
        "pooling": "last-token",
        "objective": "multiple-negatives",
        "dimensions": [32, 64, 128, 256, 512, 768, 1024],
        "maxLength": 32768,
        "queryPrefix": "Instruct: {task}\nQuery:",
        "queryTask": "Given a web search query, retrieve relevant passages that answer the query.",
        "documentPrefix": "",
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
        "blocked": "license artifact unresolved",
    },
    "arctic-m-v2-full": {
        "track": "embedding",
        "modelId": "Snowflake/snowflake-arctic-embed-m-v2.0",
        "modelRevision": "95c2741480856aa9666782eb4afe11959938017f",
        "tokenizerRevision": "95c2741480856aa9666782eb4afe11959938017f",
        "pooling": "cls",
        "objective": "multiple-negatives",
        "dimensions": [256, 768],
        "maxLength": 8192,
        "queryPrefix": "query: ",
        "documentPrefix": "",
        "lora": {},
        "blocked": "license and remote code unresolved",
    },
    "bge-m3-dense": {
        "track": "embedding",
        "modelId": "BAAI/bge-m3",
        "modelRevision": "5617a9f61b028005a4858fdac845db406aefb181",
        "tokenizerRevision": "5617a9f61b028005a4858fdac845db406aefb181",
        "pooling": "cls",
        "objective": "multiple-negatives",
        "dimensions": [1024],
        "maxLength": 8192,
        "queryPrefix": "",
        "documentPrefix": "",
        "lora": {},
        "blocked": "corrected MIT legal inventory approval required; sparse/ColBERT/hybrid heads excluded",
    },
    "nomic-v2-moe-native": {
        "track": "embedding",
        "modelId": "nomic-ai/nomic-embed-text-v2-moe",
        "modelRevision": "1066b6599d099fbb93dfcb64f9c37a7c9e503e85",
        "tokenizerRevision": "1066b6599d099fbb93dfcb64f9c37a7c9e503e85",
        "pooling": "mean",
        "objective": "multiple-negatives",
        "dimensions": [256, 768],
        "maxLength": 512,
        "queryPrefix": "search_query: ",
        "documentPrefix": "search_document: ",
        "lora": {},
        "blocked": "not authorized in first smoke wave; native Contrastors/MegaBlocks lane and external-code evidence unresolved",
    },
    "gte-multilingual-base-full": {
        "track": "embedding",
        "modelId": "Alibaba-NLP/gte-multilingual-base",
        "modelRevision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
        "tokenizerRevision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
        "pooling": "cls",
        "objective": "multiple-negatives",
        "dimensions": [768],
        "maxLength": 8192,
        "queryPrefix": "",
        "documentPrefix": "",
        "lora": {},
        "blocked": "license and remote code unresolved",
    },
}


def resolve_recipe(recipe_id, track):
    recipe = RECIPES.get(recipe_id)
    if not recipe or recipe["track"] != track:
        raise RuntimeError(f"RECIPE_DESCRIPTOR_UNAVAILABLE: {recipe_id}")
    evidence_path = Path(__file__).with_name("recipe-evidence.json")
    evidence = json.loads(evidence_path.read_text())["recipes"].get(recipe_id, {}) if evidence_path.exists() else {}
    resolved = {**recipe, **{k: v for k, v in evidence.items() if k in ("modelRevision", "tokenizerRevision")}}
    if evidence.get("status") != "supported" and evidence.get("unavailableReasons"):
        resolved["blocked"] = "; ".join(evidence["unavailableReasons"])
    return resolved


def execute_recipe(
    spec: dict[str, Any], rows: list[dict[str, Any]], framework: FrameworkAdapter, track: str
) -> dict[str, Any]:
    recipe = resolve_recipe(spec["recipeId"], track)
    if recipe.get("blocked"):
        raise RuntimeError("RECIPE_EVIDENCE_UNAVAILABLE: " + recipe["blocked"])
    for key in ("modelRevision", "tokenizerRevision", "templateHash" if track == "chat" else "modelRevision"):
        if not isinstance(recipe.get(key), str) or (
            key != "templateHash" and (len(recipe[key]) != 40 or any(c not in "0123456789abcdef" for c in recipe[key]))
        ):
            raise RuntimeError(f"RECIPE_PIN_UNRESOLVED: {spec['recipeId']} {key}")
    require_execution_gates(spec)
    identity = spec.get("recipeIdentity", {})
    if (
        identity.get("modelRevision") != recipe["modelRevision"]
        or identity.get("tokenizerRevision") != recipe["tokenizerRevision"]
    ):
        raise RuntimeError("RECIPE_IDENTITY_MISMATCH")
    tokenizer = framework.load_tokenizer(
        recipe["modelId"], recipe["tokenizerRevision"], spec.get("trustRemoteCode", False)
    )
    if track == "chat":
        actual = hashlib.sha256(str(getattr(tokenizer, "chat_template", "")).encode()).hexdigest()
        if actual != recipe["templateHash"]:
            raise RuntimeError("CHAT_TEMPLATE_HASH_MISMATCH")
        if (
            identity.get("templateHash") != recipe["templateHash"]
            or identity.get("reasoningPolicy") != recipe["reasoning"]
        ):
            raise RuntimeError("CHAT_SEMANTICS_MISMATCH")
        allowed = set(recipe["roles"])
        if any(m.get("role") not in allowed for row in rows for m in row.get("messages", [])):
            raise RuntimeError("CHAT_ROLE_UNSUPPORTED")
        if not recipe.get("lora", {}).get("target_modules") and spec.get("adapter") in ("lora", "qlora"):
            raise RuntimeError("LORA_TARGETS_UNRESOLVED")
    model = framework.load_model(
        recipe["modelId"],
        recipe["modelRevision"],
        quantization=spec.get("quantization", "bf16"),
        trust_remote_code=spec.get("trustRemoteCode", False),
        track=track,
    )
    if spec.get("adapter") in ("lora", "qlora"):
        model = framework.attach_adapter(model, recipe["lora"])
    if track == "embedding":
        dimension = spec.get("dimension")
        if dimension is not None and dimension not in recipe["dimensions"]:
            raise RuntimeError("EMBED_DIMENSION_UNSUPPORTED")
        model = framework.wrap_embedding(model, recipe, dimension)
    if track == "chat":
        data = framework.prepare_chat(rows, tokenizer)
        collator = None
    else:
        data, collator = framework.prepare_embedding(rows, tokenizer, recipe)
    config = dict(spec.get("trainingArguments", {}))
    config.update({"resume_from_checkpoint": spec.get("checkpointPath")}) if spec.get("checkpointPath") else None
    if collator:
        config["data_collator"] = collator
    trainer = (
        framework.train_sft(model, tokenizer, data, config)
        if track == "chat"
        else framework.train_embedding(model, tokenizer, data, config)
    )
    checkpoint_manifest = publish_checkpoint_descriptor(spec, trainer)
    files = framework.save(
        trainer, Path(spec["outputDirectory"]) / "portable", adapter_only=spec.get("adapter") in ("lora", "qlora")
    )
    return {
        "track": track,
        "recipeId": spec["recipeId"],
        "portableFiles": files,
        "framework": "huggingface",
        "uploads": False,
        **({"checkpointManifest": checkpoint_manifest} if checkpoint_manifest else {}),
    }


def publish_checkpoint_descriptor(spec: dict[str, Any], trainer: Any) -> str | None:
    identity_hash = spec.get("resumeIdentityHash")
    if not isinstance(identity_hash, str):
        return None
    checkpoint = getattr(getattr(trainer, "state", None), "best_model_checkpoint", None)
    if not checkpoint:
        output_dir = spec.get("trainingArguments", {}).get("output_dir")
        if output_dir:
            candidates = [(checkpoint_step(path), path) for path in Path(output_dir).glob("checkpoint-*")]
            candidates = [(step, path) for step, path in candidates if step is not None]
            complete = []
            for step, path in candidates:
                try:
                    checkpoint_inventory(path)
                    complete.append((step, path))
                except ValueError:
                    continue
            checkpoint = str(max(complete, key=lambda item: item[0])[1]) if complete else None
    if not checkpoint or not Path(checkpoint).is_dir():
        return None
    try:
        inventory = checkpoint_inventory(Path(checkpoint))
    except ValueError:
        return None
    output = Path(spec["outputDirectory"])
    output.mkdir(parents=True, exist_ok=True)
    manifest = output / "checkpoint-manifest.json"
    relative = Path(checkpoint)
    try:
        relative = relative.resolve().relative_to(manifest.parent.resolve())
    except ValueError:
        relative = Path(checkpoint).resolve()
    payload = {
        "checkpointManifestVersion": "1.0.0",
        "complete": True,
        "identityHash": identity_hash,
        "frameworkCheckpointPath": str(relative),
        "files": inventory,
    }
    temporary = manifest.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, sort_keys=True) + "\n")
    temporary.replace(manifest)
    return str(manifest)


def _template_ids(tokenizer, messages):
    rendered = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)
    if isinstance(rendered, dict):
        rendered = rendered.get("input_ids")
    if hasattr(rendered, "tolist"):
        rendered = rendered.tolist()
    if rendered and isinstance(rendered[0], list):
        rendered = rendered[0]
    if not isinstance(rendered, list) or not all(isinstance(value, int) for value in rendered):
        raise ValueError("CHAT_TEMPLATE_TOKEN_IDS_INVALID")
    return rendered


def manual_assistant_labels(tokenizer, messages):
    """Derive assistant labels from stable cumulative template boundaries, never Jinja generation masks."""
    if not messages or not isinstance(messages, list):
        raise ValueError("CHAT_MESSAGES_REQUIRED")
    final_ids = _template_ids(tokenizer, messages)
    labels = [-100] * len(final_ids)
    previous = []
    for index, message in enumerate(messages):
        current = _template_ids(tokenizer, messages[: index + 1])
        if len(current) < len(previous) or current[: len(previous)] != previous:
            raise ValueError(f"CHAT_TEMPLATE_PREFIX_DRIFT: message {index}")
        if final_ids[: len(current)] != current:
            raise ValueError(f"CHAT_TEMPLATE_FINAL_DRIFT: message {index}")
        if message.get("role") == "assistant":
            labels[len(previous) : len(current)] = current[len(previous) :]
        previous = current
    if previous != final_ids:
        raise ValueError("CHAT_TEMPLATE_FINAL_MISMATCH")
    if not any(value != -100 for value in labels):
        raise ValueError("CHAT_ASSISTANT_LABELS_EMPTY")
    return final_ids, labels


class BiEncoder(_Module):
    def __init__(self, encoder, pooling, dimension=None, normalize=True, *, dimensions=None, temperature=0.05):
        if torch is None:
            raise RuntimeError("TRAINING_DEPENDENCY_MISSING: torch")
        super().__init__()
        selected = dimensions if dimensions is not None else ([dimension] if dimension else [])
        self.encoder, self.pooling, self.dimensions = encoder, pooling, selected
        self.dimension, self.normalize, self.temperature = dimension, normalize, temperature

    def forward(self, query, document, hard_negative=None, **_):
        q_full = self._encode(query)
        d_full = self._encode(document)
        negative_full = self._encode(hard_negative) if hard_negative is not None else None
        dimensions = self.dimensions or [q_full.shape[-1]]
        losses, logits = [], None
        for dimension in dimensions:
            if dimension > q_full.shape[-1]:
                raise ValueError(f"EMBED_DIMENSION_EXCEEDS_HIDDEN: {dimension}")
            q = self._normalize(q_full[:, :dimension])
            d = self._normalize(d_full[:, :dimension])
            candidates = d
            if negative_full is not None:
                candidates = torch.cat((d, self._normalize(negative_full[:, :dimension])), dim=0)
            logits = (q @ candidates.transpose(0, 1)) / self.temperature
            labels = torch.arange(q.shape[0], device=q.device)
            losses.append(torch.nn.functional.cross_entropy(logits, labels))
        loss = torch.stack(losses).mean()
        return {"loss": loss, "logits": logits, "query_embeddings": q, "document_embeddings": d}

    def _encode(self, batch):
        import torch

        out = self.encoder(**batch)
        hidden = out.last_hidden_state
        mask = batch["attention_mask"]
        if self.pooling == "cls":
            pooled = hidden[:, 0]
        elif self.pooling == "last-token":
            pooled = hidden[torch.arange(hidden.shape[0], device=hidden.device), mask.sum(1) - 1]
        else:
            pooled = (hidden * mask.unsqueeze(-1)).sum(1) / mask.sum(1, keepdim=True).clamp(min=1)
        return pooled

    def _normalize(self, pooled):
        return torch.nn.functional.normalize(pooled, p=2, dim=-1) if self.normalize else pooled

    def save_pretrained(self, path):
        target = Path(path)
        target.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "state_dict": self.state_dict(),
                "pooling": self.pooling,
                "dimension": self.dimension,
                "dimensions": self.dimensions,
                "normalize": self.normalize,
                "temperature": self.temperature,
            },
            target / "biencoder.pt",
        )

    @classmethod
    def from_pretrained(cls, path, encoder):
        value = torch.load(Path(path) / "biencoder.pt", map_location="cpu", weights_only=True)
        model = cls(
            encoder,
            value["pooling"],
            value["dimension"],
            value["normalize"],
            dimensions=value.get("dimensions"),
            temperature=value.get("temperature", 0.05),
        )
        model.load_state_dict(value["state_dict"])
        return model
