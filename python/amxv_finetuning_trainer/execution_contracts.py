from __future__ import annotations

import hashlib
import json
import re

JOB_VERSION = "finetuning.amxv.dev/job/v1"
UUID7 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
FIELDS = {
    "apiVersion",
    "runId",
    "attemptId",
    "attempt",
    "task",
    "recipe",
    "model",
    "tokenizer",
    "image",
    "inputs",
    "resources",
    "precision",
    "quantization",
    "checkpoint",
    "evaluation",
    "export",
    "deadline",
    "executor",
}


def parse_execution_job(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("EXECUTION_JOB_INVALID")
    unknown = set(value) - FIELDS
    if unknown:
        raise ValueError("EXECUTION_UNKNOWN_FIELD: " + ",".join(sorted(unknown)))
    if value.get("apiVersion") != JOB_VERSION or not UUID7.match(str(value.get("runId", ""))):
        raise ValueError("EXECUTION_PROTOCOL_INCOMPATIBLE")
    if (
        value.get("task") not in ("chat", "embedding")
        or value.get("precision") not in ("fp32", "fp16", "bf16")
        or value.get("quantization") not in ("none", "8bit", "4bit")
    ):
        raise ValueError("EXECUTION_JOB_INVALID")
    for key in ("recipe", "model", "tokenizer"):
        ref = value.get(key)
        if (
            not isinstance(ref, dict)
            or set(ref) != {"id", "revision", "sha256"}
            or not re.fullmatch(r"[0-9a-f]{64}", str(ref.get("sha256", "")))
        ):
            raise ValueError("EXECUTION_JOB_INVALID: " + key)
    return value


def canonical_job_hash(value: dict) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def classify_resume(checkpoint: dict | None) -> str:
    if checkpoint is None:
        return "fresh"
    return "full" if checkpoint.get("complete") is True else "weights_only"
