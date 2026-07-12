"""Dependency-backed training architecture. Imports heavy frameworks only after explicit gates."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
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
        return self.AutoTokenizer.from_pretrained(
            model_id, revision=revision, trust_remote_code=trust_remote_code, local_files_only=True
        )

    def load_model(self, model_id, revision, *, quantization, trust_remote_code=False, track="chat"):
        kwargs = {"revision": revision, "trust_remote_code": trust_remote_code, "local_files_only": True}
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
        tokenizer.padding_side = recipe["paddingSide"]

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
            negative_count = sum("hard_negative" in x for x in batch)
            if negative_count not in (0, len(batch)):
                raise ValueError("EMBED_MIXED_HARD_NEGATIVES: each batch must be uniformly paired or triplet")
            if negative_count:
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


_QUALIFICATION_OPERATIONS = {
    "smokeAuthorized": ("mechanicsSmoke", ("run", "resume")),
    "smokePassed": ("qualificationRun", ("run", "resume", "evaluate", "export")),
    "qualified": ("experimentalUse", ("evaluate", "export")),
}
_QUALIFICATION_TRANSITIONS = {
    "configured": "smokeAuthorized",
    "smokeAuthorized": "smokePassed",
    "smokePassed": "qualified",
}
_QUALIFICATION_ASSERTIONS = {
    "smokeAuthorized": (
        "policyGatesReviewed",
        "licenseAccepted",
        "architectureReviewed",
        "frameworkReviewed",
        "datasetRightsReviewed",
        "offlineExecutionNoUpload",
    ),
    "smokePassed": ("forwardBackward", "finiteLoss", "finiteNonzeroGradients", "checkpointResume", "offlineReload"),
    "qualified": ("repeatedCleanRun", "evaluation", "export", "artifactManifestVerified"),
}
_QUALIFICATION_BINDINGS = (
    "commandSha256",
    "imageDigest",
    "environmentLockSha256",
    "tokenizerSha256",
    "configSha256",
    "templateOrCodeSha256",
    "datasetSha256",
    "targetInventorySha256",
    "dependencyIdentitySha256",
)
_QUALIFICATION_GATE_NAMES = (
    "experimentalExecutionApproved",
    "stagingNetworkApproved",
    "downloadsApproved",
    "remoteCodeApproved",
    "gpuApproved",
    "budgetApproved",
    "datasetRightsApproved",
    "modelLicenseAccepted",
    "uploadRequested",
    "uploadApproved",
    "architectureEvidenceApproved",
    "frameworkEvidenceApproved",
    "customKernelApproved",
)


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


def _json_digest(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(character in "0123456789abcdef" for character in value)


def _phase_blockers(recipe_id: str, state: str) -> list[str]:
    evidence_path = Path(__file__).with_name("recipe-evidence.json")
    evidence = json.loads(evidence_path.read_text())
    catalog = evidence.get("blockerCatalog", {})
    blocker_codes = evidence.get("recipes", {}).get(recipe_id, {}).get("blockerCodes", [])
    if state == "smokeAuthorized":
        return [code for code in blocker_codes if catalog.get(code, {}).get("phase") == "smokeAuthorization"]
    if state == "smokePassed":
        return [code for code in blocker_codes if catalog.get(code, {}).get("phase") == "smokePass"]
    return []


def _verify_public_signature(public_key_pem: str, signature: str, payload: bytes) -> None:
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

        public_key = serialization.load_pem_public_key(public_key_pem.encode())
        if not isinstance(public_key, Ed25519PublicKey):
            raise ValueError("qualification key must be Ed25519")
        public_key.verify(base64.b64decode(signature, validate=True), payload)
    except ImportError as error:
        raise RuntimeError("TRAINING_DEPENDENCY_MISSING: cryptography") from error
    except Exception as error:
        raise RuntimeError("QUALIFICATION_AUTHORIZATION_SIGNATURE_INVALID") from error


def _validate_evidence_chain(
    store: dict[str, Any], authorization: dict[str, Any], trust_policy: dict[str, Any]
) -> dict[str, Any]:
    if store.get("storeVersion") != "2.0.0" or store.get("trustPolicySha256") != authorization["trustPolicySha256"]:
        raise RuntimeError("QUALIFICATION_STORE_POLICY_MISMATCH")
    accepted = store.get("recipes", {}).get(authorization["recipeId"], {})
    evidence_chain = accepted.get("acceptedEvidence", [])
    evidence_ids = accepted.get("evidenceIds", [])
    evidence_digests = accepted.get("evidenceDigests", [])
    sequence = authorization.get("sequence")
    if (
        accepted.get("state") != authorization["state"]
        or accepted.get("currentDigest") != authorization["evidenceDigest"]
        or accepted.get("sequence") != sequence
        or not isinstance(sequence, int)
        or sequence < 1
        or len(evidence_chain) != sequence
        or len(evidence_ids) != sequence
        or len(evidence_digests) != sequence
    ):
        raise RuntimeError("QUALIFICATION_STORE_AUTHORIZATION_MISMATCH")
    recipe = RECIPES.get(authorization["recipeId"])
    if not recipe:
        raise RuntimeError("QUALIFICATION_RECIPE_UNKNOWN")
    previous_state = "configured"
    predecessor_digest = authorization.get("recipeIdentityHash")
    for index, evidence in enumerate(evidence_chain, start=1):
        state = evidence.get("state")
        evidence_digest = _json_digest(evidence)
        required_assertions = _QUALIFICATION_ASSERTIONS.get(state)
        signed_authorization = evidence.get("authorization", {})
        signed_gates = signed_authorization.get("gates", {})
        bindings = evidence.get("bindings", {})
        if (
            evidence.get("evidenceVersion") != "2.0.0"
            or evidence.get("sequence") != index
            or evidence.get("recipeId") != authorization["recipeId"]
            or evidence.get("recipeIdentityHash") != authorization.get("recipeIdentityHash")
            or evidence.get("revision") != recipe.get("modelRevision")
            or evidence.get("architecture") != recipe.get("architecture")
            or evidence.get("previousState") != previous_state
            or evidence.get("predecessorDigest") != predecessor_digest
            or _QUALIFICATION_TRANSITIONS.get(previous_state) != state
            or evidence.get("trustPolicySha256") != authorization.get("trustPolicySha256")
            or evidence_ids[index - 1] != evidence.get("evidenceId")
            or evidence_digests[index - 1] != evidence_digest
            or not required_assertions
            or set(evidence.get("assertions", {})) != set(required_assertions)
            or any(evidence.get("assertions", {}).get(name) is not True for name in required_assertions)
            or set(bindings) != set(_QUALIFICATION_BINDINGS)
            or any(not _is_sha256(bindings.get(name)) for name in _QUALIFICATION_BINDINGS)
            or not _is_sha256(evidence.get("artifactSha256"))
            or signed_authorization.get("operationClass") != _QUALIFICATION_OPERATIONS[state][0]
            or signed_authorization.get("dischargedBlockers") != _phase_blockers(authorization["recipeId"], state)
            or set(signed_gates) != set(_QUALIFICATION_GATE_NAMES)
            or any(
                signed_gates.get(name) is not True
                for name in _QUALIFICATION_GATE_NAMES
                if name not in ("uploadRequested", "uploadApproved")
            )
            or signed_gates.get("uploadRequested") is not False
            or signed_gates.get("uploadApproved") is not False
        ):
            raise RuntimeError("SIGNED_QUALIFICATION_EVIDENCE_MISMATCH")
        try:
            evidence_issued = datetime.fromisoformat(evidence["issuedAt"].replace("Z", "+00:00"))
            evidence_expiry = datetime.fromisoformat(evidence["expiresAt"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError("QUALIFICATION_EVIDENCE_EXPIRY_INVALID") from error
        now = datetime.now(timezone.utc)
        if evidence_issued > now or evidence_expiry <= evidence_issued:
            raise RuntimeError("QUALIFICATION_EVIDENCE_EXPIRED")
        if index == sequence and evidence_expiry <= now:
            raise RuntimeError("CURRENT_QUALIFICATION_EVIDENCE_EXPIRED")
        signer_key = trust_policy.get("keys", {}).get(evidence.get("signerKeyId"))
        if not signer_key:
            raise RuntimeError("QUALIFICATION_EVIDENCE_SIGNER_UNTRUSTED")
        canonical_evidence = {**evidence, "signatureBase64": ""}
        _verify_public_signature(signer_key, evidence.get("signatureBase64", ""), _canonical_json(canonical_evidence))
        previous_state = state
        predecessor_digest = evidence_digest
    if predecessor_digest != authorization["evidenceDigest"] or previous_state != authorization["state"]:
        raise RuntimeError("QUALIFICATION_EVIDENCE_CHAIN_HEAD_MISMATCH")
    return evidence_chain[-1]


def require_execution_gates(spec: dict[str, Any]) -> None:
    gates = spec.get("executionGates", {})
    required = ["allowModelLoad", "licenseApproved", "revisionPinned", "remoteCodeReviewed", "gpuQualified"]
    if spec.get("qualificationSchemaVersion") == "2.0.0":
        required.extend(
            [
                "experimentalExecutionApproved",
                "stagingNetworkApproved",
                "downloadsApproved",
                "remoteCodeApproved",
                "gpuApproved",
                "budgetApproved",
                "datasetRightsApproved",
                "modelLicenseAccepted",
                "architectureEvidenceApproved",
                "frameworkEvidenceApproved",
                "customKernelApproved",
            ]
        )
    missing = [k for k in required if gates.get(k) is not True]
    if missing:
        raise RuntimeError("PRODUCTION_GATE_CLOSED: " + ", ".join(missing))
    if spec.get("trustRemoteCode") and not gates.get("remoteCodeReviewed"):
        raise RuntimeError("REMOTE_CODE_REVIEW_REQUIRED")
    if spec.get("qualificationSchemaVersion") == "2.0.0":
        authorization = spec.get("qualificationAuthorization", {})
        state = authorization.get("state")
        operation = spec.get("operation", "run")
        if (
            state not in _QUALIFICATION_OPERATIONS
            or authorization.get("recipeId") != spec.get("recipeId")
            or not isinstance(authorization.get("evidenceDigest"), str)
            or len(authorization["evidenceDigest"]) != 64
        ):
            raise RuntimeError("ACCEPTED_QUALIFICATION_AUTHORIZATION_REQUIRED")
        operation_class, allowed_operations = _QUALIFICATION_OPERATIONS[state]
        if (
            authorization.get("operationClass") != operation_class
            or authorization.get("operation") != operation
            or operation not in allowed_operations
            or authorization.get("outputDirectory") != spec.get("outputDirectory")
        ):
            raise RuntimeError("QUALIFICATION_OPERATION_NOT_AUTHORIZED")
        trust_policy_sha256 = os.environ.get("AMXV_QUALIFICATION_TRUST_POLICY_SHA256")
        trust_policy_path = os.environ.get("AMXV_QUALIFICATION_TRUST_POLICY_PATH")
        if (
            not trust_policy_sha256
            or authorization.get("trustPolicySha256") != trust_policy_sha256
            or not trust_policy_path
        ):
            raise RuntimeError("INDEPENDENT_QUALIFICATION_TRUST_CONTEXT_REQUIRED")
        trust_policy = json.loads(Path(trust_policy_path).read_bytes())
        if (
            _json_digest(trust_policy) != trust_policy_sha256
            or trust_policy.get("policyVersion") != "1.0.0"
            or not isinstance(trust_policy.get("policyId"), str)
            or not isinstance(trust_policy.get("keys"), dict)
            or not trust_policy["keys"]
        ):
            raise RuntimeError("QUALIFICATION_TRUST_POLICY_DIGEST_MISMATCH")
        try:
            expires = datetime.fromisoformat(authorization["expiresAt"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError("QUALIFICATION_AUTHORIZATION_EXPIRY_INVALID") from error
        if expires <= datetime.now(timezone.utc):
            raise RuntimeError("QUALIFICATION_AUTHORIZATION_EXPIRED")
        architecture_hash = hashlib.sha256(
            json.dumps(spec.get("architectureEvidence", {}), sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if architecture_hash != authorization.get("architectureEvidenceSha256"):
            raise RuntimeError("SIGNED_ARCHITECTURE_EVIDENCE_MISMATCH")
        store_path = Path(authorization.get("storePath", ""))
        if not store_path.is_file():
            raise RuntimeError("QUALIFICATION_STORE_REQUIRED")
        store_bytes = store_path.read_bytes()
        if hashlib.sha256(store_bytes).hexdigest() != authorization.get("storeSha256"):
            raise RuntimeError("QUALIFICATION_STORE_HASH_MISMATCH")
        current_evidence = _validate_evidence_chain(json.loads(store_bytes), authorization, trust_policy)
        if (
            current_evidence.get("artifactSha256") != authorization.get("artifactSha256")
            or current_evidence.get("expiresAt") != authorization.get("expiresAt")
            or current_evidence.get("bindings") != authorization.get("evidenceBindings")
            or current_evidence.get("bindings", {}).get("targetInventorySha256")
            != spec.get("architectureEvidence", {}).get("inventorySha256")
            or current_evidence.get("authorization", {}).get("dischargedBlockers")
            != authorization.get("dischargedBlockers")
            or any(
                current_evidence.get("authorization", {}).get("gates", {}).get(name) != gates.get(name)
                for name in _QUALIFICATION_GATE_NAMES
            )
        ):
            raise RuntimeError("SIGNED_QUALIFICATION_EVIDENCE_MISMATCH")
        authorization_payload = {
            "recipeId": authorization.get("recipeId"),
            "recipeIdentityHash": authorization.get("recipeIdentityHash"),
            "evidenceDigest": authorization.get("evidenceDigest"),
            "sequence": authorization.get("sequence"),
            "dischargedBlockers": authorization.get("dischargedBlockers"),
            "storeSha256": authorization.get("storeSha256"),
            "trustPolicySha256": authorization.get("trustPolicySha256"),
            "expiresAt": authorization.get("expiresAt"),
            "architectureEvidenceSha256": authorization.get("architectureEvidenceSha256"),
            "operationClass": authorization.get("operationClass"),
            "operation": authorization.get("operation"),
            "outputDirectory": authorization.get("outputDirectory"),
            "artifactSha256": authorization.get("artifactSha256"),
            "evidenceBindings": authorization.get("evidenceBindings"),
            "executionGates": gates,
        }
        public_key_pem = trust_policy.get("keys", {}).get(authorization.get("signerKeyId"))
        if not public_key_pem:
            raise RuntimeError("QUALIFICATION_AUTHORIZATION_SIGNER_UNTRUSTED")
        _verify_public_signature(
            public_key_pem,
            authorization.get("authorizationSignatureBase64", ""),
            json.dumps(authorization_payload, sort_keys=True, separators=(",", ":")).encode(),
        )
        if gates["uploadRequested"] is not False or gates["uploadApproved"] is not False:
            raise RuntimeError("TRAINING_UPLOADS_FORBIDDEN")


RECIPES = {
    "qwen3.6-27b": {
        "firstWaveExecutable": False,
        "track": "chat",
        "modelId": "Qwen/Qwen3.6-27B",
        "modelRevision": "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
        "tokenizerRevision": "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
        "architecture": "qwen3_5",
        "architectureFamily": "hybrid-dense",
        "reasoning": "unified",
        "templateHash": None,
        "templateHashStatus": "required-before-smoke",
        "eosPolicy": "tokenizer-native-im-end",
        "padPolicy": "tokenizer-native-endoftext-distinct-from-eos",
        "roles": ["system", "user", "assistant", "tool"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": [
                "q_proj",
                "k_proj",
                "v_proj",
                "o_proj",
                "gate_proj",
                "up_proj",
                "down_proj",
                "linear_attn",
            ],
        },
        "frozen": ["vision", "lm_head"],
    },
    "qwen3.6-35b-a3b": {
        "firstWaveExecutable": False,
        "track": "chat",
        "modelId": "Qwen/Qwen3.6-35B-A3B",
        "modelRevision": "995ad96eacd98c81ed38be0c5b274b04031597b0",
        "tokenizerRevision": "995ad96eacd98c81ed38be0c5b274b04031597b0",
        "architecture": "qwen3_5_moe",
        "architectureFamily": "hybrid-moe",
        "reasoning": "unified",
        "templateHash": None,
        "templateHashStatus": "required-before-smoke",
        "roles": ["system", "user", "assistant", "tool"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "linear_attn"],
        },
        "frozen": ["router", "experts", "vision", "lm_head"],
        "blocked": "not authorized in first smoke wave; packed expert target_parameters unresolved",
    },
    "nemotron-cascade-2-30b-a3b": {
        "firstWaveExecutable": False,
        "track": "chat",
        "modelId": "nvidia/Nemotron-Cascade-2-30B-A3B",
        "modelRevision": "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7",
        "tokenizerRevision": "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7",
        "architecture": "nemotron_h",
        "architectureFamily": "custom-nemotron-h",
        "reasoning": "thinking-policy-required",
        "templateHash": None,
        "templateHashStatus": "required-before-smoke",
        "roles": ["system", "user", "assistant", "tool"],
        "blocked": "not authorized in first smoke wave; NVIDIA license artifact, remote code, Mamba kernels, and dedicated adapter unresolved",
    },
    "nemotron-3-nano-30b-a3b": {
        "firstWaveExecutable": False,
        "track": "chat",
        "modelId": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
        "modelRevision": "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
        "tokenizerRevision": "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
        "architecture": "nemotron_h",
        "architectureFamily": "custom-nemotron-h",
        "reasoning": "explicit",
        "templateHash": None,
        "templateHashStatus": "required-before-smoke",
        "roles": ["system", "user", "assistant", "tool"],
        "blocked": "not authorized in first smoke wave; NVIDIA license artifact, remote code, Mamba kernels, and dedicated adapter unresolved",
    },
    "olmo-3.1-32b-instruct": {
        "firstWaveExecutable": True,
        "track": "chat",
        "modelId": "allenai/Olmo-3.1-32B-Instruct",
        "modelRevision": "ac0587e4a7744a551c059d8cd17ba220bc940dae",
        "tokenizerRevision": "ac0587e4a7744a551c059d8cd17ba220bc940dae",
        "architecture": "olmo3",
        "architectureFamily": "dense",
        "reasoning": "instruct",
        "templateHash": None,
        "templateHashStatus": "required-before-smoke",
        "eosPolicy": "last-assistant-endoftext",
        "padPolicy": "pad-token-distinct-from-eos",
        "roles": ["system", "user", "assistant", "tool"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
    },
    "olmo-3.1-32b-think": {
        "firstWaveExecutable": True,
        "track": "chat",
        "modelId": "allenai/Olmo-3.1-32B-Think",
        "modelRevision": "832c3f543499af8fe68b88359501de9cb7840544",
        "tokenizerRevision": "832c3f543499af8fe68b88359501de9cb7840544",
        "architecture": "olmo3",
        "architectureFamily": "dense",
        "reasoning": "think",
        "templateHash": None,
        "templateHashStatus": "required-before-smoke",
        "eosPolicy": "last-assistant-endoftext",
        "padPolicy": "pad-token-distinct-from-eos",
        "roles": ["system", "user", "assistant"],
        "lora": {
            "r": 16,
            "lora_alpha": 32,
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
    },
    "qwen3-embed-0.6b-lora": {
        "firstWaveExecutable": True,
        "track": "embedding",
        "methods": ["lora"],
        "modelId": "Qwen/Qwen3-Embedding-0.6B",
        "architecture": "qwen3",
        "architectureFamily": "dense",
        "modelRevision": "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3",
        "tokenizerRevision": "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3",
        "pooling": "last-token",
        "paddingSide": "left",
        "normalization": "l2",
        "negativePolicy": "in-batch-and-optional-uniform-hard-negatives",
        "nativeHeads": ["dense"],
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
        "firstWaveExecutable": True,
        "track": "embedding",
        "methods": ["lora"],
        "modelId": "Snowflake/snowflake-arctic-embed-m-v2.0",
        "architecture": "gte",
        "architectureFamily": "custom-gte",
        "modelRevision": "95c2741480856aa9666782eb4afe11959938017f",
        "tokenizerRevision": "95c2741480856aa9666782eb4afe11959938017f",
        "pooling": "cls",
        "paddingSide": "right",
        "normalization": "l2",
        "negativePolicy": "in-batch-and-optional-uniform-hard-negatives",
        "nativeHeads": ["dense"],
        "objective": "multiple-negatives",
        "dimensions": [256, 768],
        "maxLength": 8192,
        "queryPrefix": "query: ",
        "documentPrefix": "",
        "lora": {"r": 16, "lora_alpha": 32, "target_modules": ["packed_qkv", "output", "ffn"]},
        "blocked": "license and remote code unresolved",
    },
    "bge-m3-dense": {
        "firstWaveExecutable": True,
        "track": "embedding",
        "methods": ["lora"],
        "modelId": "BAAI/bge-m3",
        "architecture": "xlm-roberta",
        "architectureFamily": "dense",
        "modelRevision": "5617a9f61b028005a4858fdac845db406aefb181",
        "tokenizerRevision": "5617a9f61b028005a4858fdac845db406aefb181",
        "pooling": "cls",
        "paddingSide": "right",
        "normalization": "l2",
        "negativePolicy": "in-batch-and-optional-uniform-hard-negatives",
        "nativeHeads": ["dense"],
        "objective": "multiple-negatives",
        "dimensions": [1024],
        "maxLength": 8192,
        "queryPrefix": "",
        "documentPrefix": "",
        "lora": {"r": 16, "lora_alpha": 32, "target_modules": ["query", "key", "value", "dense"]},
        "blocked": "corrected MIT legal inventory approval required; sparse/ColBERT/hybrid heads excluded",
    },
    "nomic-v2-moe-native": {
        "firstWaveExecutable": False,
        "track": "embedding",
        "methods": ["lora"],
        "modelId": "nomic-ai/nomic-embed-text-v2-moe",
        "architecture": "nomic_bert",
        "architectureFamily": "custom-nomic-bert",
        "modelRevision": "1066b6599d099fbb93dfcb64f9c37a7c9e503e85",
        "tokenizerRevision": "1066b6599d099fbb93dfcb64f9c37a7c9e503e85",
        "pooling": "mean",
        "paddingSide": "right",
        "normalization": "l2",
        "negativePolicy": "native-lane-required",
        "nativeHeads": ["dense", "moe-router"],
        "objective": "multiple-negatives",
        "dimensions": [256, 768],
        "maxLength": 512,
        "queryPrefix": "search_query: ",
        "documentPrefix": "search_document: ",
        "lora": {},
        "frozen": ["router"],
        "blocked": "not authorized in first smoke wave; native Contrastors/MegaBlocks lane and external-code evidence unresolved",
    },
    "gte-multilingual-base-full": {
        "firstWaveExecutable": True,
        "track": "embedding",
        "methods": ["lora"],
        "modelId": "Alibaba-NLP/gte-multilingual-base",
        "architecture": "new",
        "architectureFamily": "custom-new",
        "modelRevision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
        "tokenizerRevision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
        "pooling": "cls",
        "paddingSide": "right",
        "normalization": "l2",
        "negativePolicy": "in-batch-and-optional-uniform-hard-negatives",
        "nativeHeads": ["dense"],
        "objective": "multiple-negatives",
        "dimensions": [768],
        "maxLength": 8192,
        "queryPrefix": "",
        "documentPrefix": "",
        "lora": {"r": 16, "lora_alpha": 32, "target_modules": ["reviewed-encoder-linears"]},
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
    if evidence.get("supportState") != "supported" and evidence.get("unavailableReasons"):
        resolved["blockers"] = evidence["unavailableReasons"]
    return resolved


def execute_recipe(
    spec: dict[str, Any], rows: list[dict[str, Any]], framework: FrameworkAdapter, track: str
) -> dict[str, Any]:
    recipe = resolve_recipe(spec["recipeId"], track)
    blockers = recipe.get("blockers") or ([recipe["blocked"]] if recipe.get("blocked") else [])
    discharged = spec.get("qualificationAuthorization", {}).get("dischargedBlockers", [])
    if not recipe.get("firstWaveExecutable", True):
        raise RuntimeError("RECIPE_FIRST_WAVE_NON_EXECUTABLE: " + "; ".join(blockers))
    current_state = spec.get("qualificationAuthorization", {}).get("state")
    applicable_blockers = (
        _phase_blockers(spec["recipeId"], current_state)
        if spec.get("qualificationSchemaVersion") == "2.0.0"
        else blockers
    )
    if applicable_blockers and (
        spec.get("qualificationSchemaVersion") != "2.0.0"
        or not isinstance(discharged, list)
        or discharged != applicable_blockers
    ):
        raise RuntimeError("RECIPE_EVIDENCE_UNAVAILABLE: " + "; ".join(applicable_blockers))
    if recipe.get("methods") and spec.get("adapter") not in recipe["methods"]:
        raise RuntimeError("RECIPE_OPTIMIZATION_METHOD_UNSUPPORTED")
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
    if recipe["modelId"].startswith("Qwen/Qwen3.6-"):
        raise RuntimeError("QWEN_TEXT_ONLY_ADAPTER_NOT_IMPLEMENTED")
    if recipe.get("architectureFamily", "").startswith("custom"):
        code_identity = spec.get("codeIdentity", {})
        if (
            not isinstance(code_identity.get("revision"), str)
            or len(code_identity["revision"]) != 40
            or not isinstance(code_identity.get("sha256"), str)
            or len(code_identity["sha256"]) != 64
        ):
            raise RuntimeError("REMOTE_CODE_IDENTITY_REQUIRED")
    model = framework.load_model(
        recipe["modelId"],
        recipe["modelRevision"],
        quantization=spec.get("quantization", "bf16"),
        trust_remote_code=spec.get("trustRemoteCode", False),
        track=track,
    )
    if spec.get("adapter") in ("lora", "qlora"):
        adapter_config = architecture_adapter_config(model, recipe, spec)
        model = framework.attach_adapter(model, adapter_config)
        validate_trainable_inventory(model, recipe, spec)
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


def architecture_adapter_config(model, recipe, spec):
    config = dict(recipe.get("lora", {}))
    if spec.get("qualificationSchemaVersion") != "2.0.0":
        return config
    evidence = spec.get("architectureEvidence", {})
    if not hasattr(model, "named_modules") or not hasattr(model, "named_parameters"):
        raise RuntimeError("ARCHITECTURE_INVENTORY_UNAVAILABLE")
    modules = sorted(name for name, _ in model.named_modules())
    parameters = sorted(name for name, _ in model.named_parameters())
    inventory = hashlib.sha256(
        json.dumps({"modules": modules, "parameters": parameters}, separators=(",", ":")).encode()
    ).hexdigest()
    if evidence.get("inventorySha256") != inventory:
        raise RuntimeError("ARCHITECTURE_INVENTORY_MISMATCH")
    resolved = evidence.get("resolvedTargetModules")
    if not isinstance(resolved, list) or sorted(resolved) != sorted(config.get("target_modules", [])):
        raise RuntimeError("LORA_RESOLVED_TARGETS_MISMATCH")
    excluded = tuple(recipe.get("frozen", ()))
    if any(any(part in name for part in excluded) for name in resolved):
        raise RuntimeError("LORA_EXCLUDED_TARGET_SELECTED")
    target_parameters = evidence.get("targetParameters", [])
    modules_to_save = evidence.get("modulesToSave", [])
    if target_parameters:
        config["target_parameters"] = target_parameters
    if modules_to_save:
        config["modules_to_save"] = modules_to_save
    return config


def validate_trainable_inventory(model, recipe, spec):
    if spec.get("qualificationSchemaVersion") != "2.0.0":
        return
    trainable = sorted(
        name for name, parameter in model.named_parameters() if getattr(parameter, "requires_grad", False)
    )
    actual = hashlib.sha256(json.dumps(trainable, separators=(",", ":")).encode()).hexdigest()
    if spec.get("architectureEvidence", {}).get("trainableNamesSha256") != actual:
        raise RuntimeError("TRAINABLE_PARAMETER_INVENTORY_MISMATCH")
    forbidden = tuple(recipe.get("frozen", ()))
    unexpectedly_trainable = [name for name in trainable if any(part in name for part in forbidden)]
    if unexpectedly_trainable:
        raise RuntimeError("FORBIDDEN_PARAMETER_TRAINABLE: " + ", ".join(unexpectedly_trainable))


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


def manual_assistant_labels(tokenizer, messages, terminal_token_ids=None):
    """Derive assistant labels from stable cumulative template boundaries, never Jinja generation masks."""
    if not messages or not isinstance(messages, list):
        raise ValueError("CHAT_MESSAGES_REQUIRED")
    final_ids = _template_ids(tokenizer, messages)
    labels = [-100] * len(final_ids)
    previous = []
    for index, message in enumerate(messages):
        if message.get("role") == "assistant":
            content = message.get("content")
            has_content = isinstance(content, str) and bool(content.strip())
            has_content = has_content or (isinstance(content, list) and bool(content))
            has_tool_call = bool(message.get("tool_calls"))
            if not (has_content or has_tool_call):
                raise ValueError(f"CHAT_EMPTY_ASSISTANT_TARGET: message {index}")
        current = _template_ids(tokenizer, messages[: index + 1])
        if len(current) < len(previous) or current[: len(previous)] != previous:
            raise ValueError(f"CHAT_TEMPLATE_PREFIX_DRIFT: message {index}")
        if final_ids[: len(current)] != current:
            raise ValueError(f"CHAT_TEMPLATE_FINAL_DRIFT: message {index}")
        if message.get("role") == "assistant":
            delta = current[len(previous) :]
            eos_id = getattr(tokenizer, "eos_token_id", None)
            expected_terminal = (
                terminal_token_ids if terminal_token_ids is not None else ([eos_id] if isinstance(eos_id, int) else [])
            )
            if expected_terminal and delta[-len(expected_terminal) :] != expected_terminal:
                raise ValueError(f"CHAT_ASSISTANT_TERMINAL_SEQUENCE_MISSING: message {index}")
            labels[len(previous) : len(current)] = delta
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
            positions = torch.arange(mask.shape[1], device=hidden.device).expand_as(mask)
            last_non_pad = (positions * mask).argmax(dim=1)
            pooled = hidden[torch.arange(hidden.shape[0], device=hidden.device), last_non_pad]
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
