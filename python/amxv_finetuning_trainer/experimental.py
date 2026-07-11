from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

VERSION = "1.0.0"


def preflight_spec(spec: dict[str, Any]) -> None:
    expected = {
        "dpo": "preference-pairs",
        "orpo": "preference-pairs",
        "logit": "top-k-logits",
        "feature": "layer-features",
    }
    objective = spec.get("objective")
    if spec.get("version") != VERSION or objective not in expected or spec.get("datasetShape") != expected[objective]:
        raise ValueError("EXPERIMENTAL_DATA_SHAPE_MISMATCH")
    recipes = {"dpo": "cpu-tiny-dpo", "orpo": "cpu-tiny-orpo", "logit": "local-logit", "feature": "local-feature"}
    if spec.get("recipeId") != recipes[objective]:
        raise ValueError("EXPERIMENTAL_RECIPE_MISMATCH")


def _softmax(values: list[float], temperature: float) -> list[float]:
    if temperature <= 0:
        raise ValueError("LOGIT_TOPK_INVALID: temperature must be positive")
    scaled = [v / temperature for v in values]
    peak = max(scaled)
    weights = [math.exp(v - peak) for v in scaled]
    total = sum(weights)
    return [v / total for v in weights]


def topk_target(logits: list[float], k: int, temperature: float, max_bytes: int) -> dict[str, Any]:
    if not logits or k < 1 or k > len(logits):
        raise ValueError("LOGIT_TOPK_INVALID: invalid vocabulary or k")
    probabilities = _softmax(logits, temperature)
    ranked = sorted(enumerate(probabilities), key=lambda item: (-item[1], item[0]))[:k]
    target = {
        "version": VERSION,
        "topK": [{"tokenId": token, "probability": probability} for token, probability in ranked],
        "residualMass": max(0.0, 1 - sum(p for _, p in ranked)),
        "temperature": temperature,
        "approximation": {"kind": "top-k-plus-residual", "k": k},
    }
    if len(json.dumps(target, separators=(",", ":"))) > max_bytes:
        raise ValueError("LOGIT_STORAGE_LIMIT: target exceeds configured bytes")
    return target


def align_vocabulary(teacher_hash: str, student_hash: str, mapping: dict[int, int] | None) -> None:
    if teacher_hash != student_hash and not mapping:
        raise ValueError("TOKENIZER_MISMATCH: explicit vocabulary mapping required")
    if mapping and (len(set(mapping.values())) != len(mapping) or any(k < 0 or v < 0 for k, v in mapping.items())):
        raise ValueError("VOCAB_ALIGNMENT_INVALID: mapping must be one-to-one and non-negative")


def feature_loss(
    teacher: list[list[float]],
    student: list[list[float]],
    projection: list[list[float]] | None,
    mask: list[int],
    kind: str = "mse",
) -> float:
    if len(teacher) != len(student) or len(mask) != len(teacher):
        raise ValueError("FEATURE_SHAPE_MISMATCH: token and mask lengths differ")
    if not teacher:
        raise ValueError("FEATURE_SHAPE_MISMATCH: empty features")
    projected = []
    for row in teacher:
        if projection is None:
            projected.append(row)
        else:
            if len(projection) != len(row) or not projection or len({len(x) for x in projection}) != 1:
                raise ValueError("FEATURE_PROJECTION_INVALID: matrix input dimension differs")
            projected.append(
                [sum(value * projection[i][j] for i, value in enumerate(row)) for j in range(len(projection[0]))]
            )
    if any(len(a) != len(b) for a, b in zip(projected, student)):
        raise ValueError("FEATURE_SHAPE_MISMATCH: projected and student dimensions differ")
    selected = [(a, b) for a, b, keep in zip(projected, student, mask) if keep]
    if not selected:
        raise ValueError("FEATURE_MASK_EMPTY: no selected tokens")
    if kind == "mse":
        return sum((x - y) ** 2 for a, b in selected for x, y in zip(a, b)) / sum(len(a) for a, _ in selected)
    if kind == "cosine":
        losses = []
        for a, b in selected:
            denominator = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(x * x for x in b))
            losses.append(1 - (sum(x * y for x, y in zip(a, b)) / denominator if denominator else 0))
        return sum(losses) / len(losses)
    raise ValueError("FEATURE_LOSS_INVALID")


def preference_loss(chosen: list[float], rejected: list[float], objective: str, beta: float = 0.1) -> float:
    if len(chosen) != len(rejected) or not chosen:
        raise ValueError("PREFERENCE_SHAPE_MISMATCH")
    margins = [c - r for c, r in zip(chosen, rejected)]
    if objective == "dpo":
        return sum(math.log1p(math.exp(-beta * m)) for m in margins) / len(margins)
    if objective == "orpo":
        return sum(math.log1p(math.exp(-m)) for m in margins) / len(margins)
    raise ValueError("PREFERENCE_OBJECTIVE_UNSUPPORTED")


def checkpoint(path: Path, state: dict[str, Any]) -> None:
    path.write_text(json.dumps(state, sort_keys=True) + "\n")


def resume(path: Path, immutable: dict[str, Any]) -> dict[str, Any]:
    state = json.loads(path.read_text())
    if state.get("immutable") != immutable:
        raise ValueError("PLUGIN_RESUME_MISMATCH: immutable configuration changed")
    return state


def write_tensor(root: Path, name: str, payload: bytes, shape: list[int], max_bytes: int) -> dict[str, Any]:
    if len(payload) > max_bytes:
        raise ValueError("TENSOR_STORAGE_LIMIT")
    digest = hashlib.sha256(payload).hexdigest()
    path = root / f"{digest}-{name}"
    path.write_bytes(payload)
    return {"path": path.name, "sha256": digest, "bytes": len(payload), "shape": shape}


def verify_tensor(root: Path, reference: dict[str, Any]) -> None:
    payload = (root / reference["path"]).read_bytes()
    if len(payload) != reference["bytes"] or hashlib.sha256(payload).hexdigest() != reference["sha256"]:
        raise ValueError("PLUGIN_ARTIFACT_HASH_MISMATCH")
