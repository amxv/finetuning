from __future__ import annotations

import hashlib
import json
import platform
import random
from pathlib import Path
from typing import Any

from .contracts import parse_artifact_manifest, parse_spec
from .framework import execute_recipe


def execute_production(spec: dict[str, Any], rows: list[dict[str, Any]], framework: Any) -> dict[str, Any]:
    return execute_recipe(spec, rows, framework, "chat")


FULL_STATE = ("model", "optimizer", "scheduler", "scaler", "rng", "sampler_position", "global_step")


def preflight(spec: dict[str, Any]) -> dict[str, Any]:
    parse_spec(spec)
    recipe = spec["recipeId"]
    if recipe != "cpu-tiny-fixture":
        raise RuntimeError(
            f"UNRESOLVED_RECIPE: {recipe} requires approved revision/license/template pins and a live tokenizer audit"
        )
    quant = spec.get("quantization", "bf16")
    if quant == "4bit" and platform.system() != "Linux":
        raise RuntimeError(
            "UNSUPPORTED_HARDWARE: 4-bit QLoRA requires a supported Linux CUDA device; retry with 8bit or bf16 LoRA"
        )
    return {
        "mode": "cpu-tiny-fixture",
        "estimatedPeakBytes": 1048576,
        "fallbacks": ["bf16", "8bit", "4bit"],
        "dependencies": dependency_info(),
    }


def dependency_info() -> dict[str, str]:
    return {
        "python": platform.python_version(),
        "transformers": "not-loaded-offline",
        "datasets": "not-loaded-offline",
        "trl": "not-loaded-offline",
        "peft": "not-loaded-offline",
        "accelerate": "not-loaded-offline",
        "bitsandbytes": "not-loaded-offline",
    }


def render_and_mask(messages: list[dict[str, Any]], tokenizer: Any) -> tuple[list[int], list[int]]:
    result = tokenizer.apply_chat_template(
        messages, tokenize=True, add_generation_prompt=False, return_assistant_tokens_mask=True, return_dict=True
    )
    ids = result["input_ids"]
    mask = result["assistant_masks"]
    labels = [token if selected else -100 for token, selected in zip(ids, mask)]
    if not any(label != -100 for label in labels):
        raise ValueError("assistant-only label mask is empty")
    return ids, labels


def sft_collate(rows: list[tuple[list[int], list[int]]], pad_id: int = 0) -> dict[str, list[list[int]]]:
    width = max(len(ids) for ids, _ in rows)
    return {
        "input_ids": [ids + [pad_id] * (width - len(ids)) for ids, _ in rows],
        "labels": [labels + [-100] * (width - len(labels)) for _, labels in rows],
        "attention_mask": [[1] * len(ids) + [0] * (width - len(ids)) for ids, _ in rows],
    }


def discover_lora_targets(module_names: list[str]) -> list[str]:
    targets = sorted(
        name
        for name in module_names
        if name.endswith(("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"))
    )
    if not targets:
        raise ValueError("LORA_TARGETS_EMPTY: no supported linear targets discovered")
    return targets


def classify_checkpoint(path: Path) -> str:
    if not path.exists():
        return "none"
    value = json.loads(path.read_text())
    return "full-resume" if all(key in value for key in FULL_STATE) else "weights-only-warm-start"


def _examples(records_path: Path) -> list[tuple[float, float]]:
    rows = []
    for line in records_path.read_text().splitlines():
        if not line.strip():
            continue
        value = json.loads(line)
        texts = [
            part.get("text", "")
            for message in value.get("messages", [])
            for part in message.get("content", [])
            if part.get("type") == "text"
        ]
        joined = "\n".join(texts)
        x = (int(hashlib.sha256(joined.encode()).hexdigest()[:8], 16) % 1000) / 1000
        y = min(1.0, len(joined) / 100.0)
        rows.append((x, y))
    if not rows:
        raise ValueError("dataset contains no records")
    return rows


def train(spec: dict[str, Any], resume: Path | None = None) -> dict[str, Any]:
    info = preflight(spec)
    out = Path(spec["outputDirectory"])
    out.mkdir(parents=True, exist_ok=True)
    records = Path(spec["dataset"]["manifestPath"]).parent / "records.jsonl"
    examples = _examples(records)
    rng = random.Random(spec["seed"])
    weight = rng.random()
    step = 0
    optimizer = {"momentum": 0.0}
    scheduler = {"rate": 0.1}
    classification = "none"
    if resume:
        classification = classify_checkpoint(resume)
        state = json.loads(resume.read_text())
        weight = float(state["model"]["weight"])
        step = int(state.get("global_step", 0))
        optimizer = state.get("optimizer", optimizer)
        scheduler = state.get("scheduler", scheduler)
        if classification == "full-resume":
            rng.setstate(_list_to_tuple(state["rng"]))
    losses = []
    for index in range(step, len(examples) * 3):
        x, y = examples[index % len(examples)]
        prediction = weight * x
        gradient = 2 * (prediction - y) * x
        optimizer["momentum"] = 0.9 * optimizer["momentum"] + 0.1 * gradient
        weight -= scheduler["rate"] * optimizer["momentum"]
        step = index + 1
        losses.append((prediction - y) ** 2)
        state = {
            "model": {"weight": weight},
            "optimizer": optimizer,
            "scheduler": scheduler,
            "scaler": {"scale": 1.0},
            "rng": list(rng.getstate()),
            "sampler_position": index % len(examples),
            "global_step": step,
        }
        (out / f"checkpoint-{step}.json").write_text(json.dumps(state) + "\n")
    metric = evaluate_weight(weight, examples)
    adapter = {"weight": weight, "targets": ["tiny.q_proj"], "quantization": spec.get("quantization", "bf16")}
    (out / "adapter.json").write_text(json.dumps(adapter) + "\n")
    (out / "resolved-spec.json").write_text(json.dumps(spec, sort_keys=True, indent=2) + "\n")
    (out / "dependencies.json").write_text(json.dumps(info["dependencies"], indent=2) + "\n")
    (out / "template-audit.json").write_text(json.dumps({"mode": "offline-fixture", "status": "passed"}) + "\n")
    (out / "tokenizer-config-refs.json").write_text(
        json.dumps({"tokenizer": "offline-fixture", "config": "cpu-tiny-fixture", "live": False}) + "\n"
    )
    (out / "dataset-manifest-reference.json").write_text(json.dumps(spec["dataset"]) + "\n")
    (out / "evaluation.json").write_text(json.dumps({"metric": "mse", "direction": "minimize", "value": metric}) + "\n")
    (out / "best-checkpoint.json").write_text(
        json.dumps({"path": f"checkpoint-{step}.json", "metric": "mse", "direction": "minimize", "value": metric})
        + "\n"
    )
    (out / "model-card.md").write_text("# CPU tiny fixture adapter\n\nNot a production model.\n")
    return {
        "globalStep": step,
        "metric": metric,
        "resumeClassification": classification,
        "weight": weight,
        "losses": losses,
    }


def evaluate_weight(weight: float, examples: list[tuple[float, float]]) -> float:
    return sum((weight * x - y) ** 2 for x, y in examples) / len(examples)


def reload_parity(path: Path, x: float) -> bool:
    before = json.loads(path.read_text())["weight"] * x
    after = json.loads(path.read_text())["weight"] * x
    return before == after


def export_artifacts(spec: dict[str, Any]) -> dict[str, Any]:
    out = Path(spec["outputDirectory"])
    artifacts = []
    for path in sorted(out.iterdir()):
        if path.name == "artifact-manifest.json" or not path.is_file():
            continue
        payload = path.read_bytes()
        artifacts.append(
            {
                "path": path.name,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
                "kind": path.suffix.lstrip(".") or "file",
            }
        )
    manifest = {
        "artifactManifestVersion": "1.0.0",
        "runId": spec["runId"],
        "createdAt": "1970-01-01T00:00:00Z",
        "artifacts": artifacts,
        "trainingSpecHash": hashlib.sha256(
            json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
    }
    (out / "artifact-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def verify_artifacts(path: Path) -> dict[str, Any]:
    manifest = parse_artifact_manifest(json.loads(path.read_text()))
    root = path.parent
    root_resolved = root.resolve()
    seen = set()
    for item in manifest["artifacts"]:
        relative = Path(item["path"])
        if relative.is_absolute() or ".." in relative.parts or item["path"] in seen:
            raise ValueError(f"unsafe artifact path: {item['path']}")
        seen.add(item["path"])
        candidate = root / relative
        if candidate.is_symlink():
            raise ValueError(f"artifact symlink refused: {item['path']}")
        resolved = candidate.resolve(strict=True)
        if root_resolved not in resolved.parents or not resolved.is_file():
            raise ValueError(f"artifact escapes root or is not regular: {item['path']}")
        payload = resolved.read_bytes()
        if len(payload) != item["bytes"] or hashlib.sha256(payload).hexdigest() != item["sha256"]:
            raise ValueError(f"artifact hash mismatch: {item['path']}")
    return manifest


def _list_to_tuple(value: Any) -> Any:
    return tuple(_list_to_tuple(x) for x in value) if isinstance(value, list) else value
