from __future__ import annotations

from typing import Any

VERSIONS = {"trainingSpecVersion": "1.0.0", "trainingEventVersion": "1.0.0", "artifactManifestVersion": "1.0.0"}


def _parse(value: Any, version_key: str, required: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("contract must be an object")
    actual = value.get(version_key)
    if not isinstance(actual, str) or actual.split(".")[0] != VERSIONS[version_key].split(".")[0]:
        raise ValueError(f"incompatible {version_key} major version")
    missing = [key for key in required if key not in value]
    if missing:
        raise ValueError(f"missing fields: {', '.join(missing)}")
    return value


def parse_spec(value: Any) -> dict[str, Any]:
    value = _parse(
        value, "trainingSpecVersion", ("runId", "dataset", "recipeId", "outputDirectory", "objective", "seed")
    )
    if value["recipeId"] != "cpu-tiny-fixture":
        gates = value.get("executionGates")
        identity = value.get("recipeIdentity")
        if not isinstance(gates, dict) or any(
            not isinstance(gates.get(k), bool)
            for k in ("allowModelLoad", "licenseApproved", "revisionPinned", "remoteCodeReviewed", "gpuQualified")
        ):
            raise ValueError("invalid production executionGates")
        if value.get("qualificationSchemaVersion") == "2.0.0" and any(
            not isinstance(gates.get(k), bool)
            for k in (
                "networkApproved",
                "downloadsApproved",
                "budgetApproved",
                "datasetRightsApproved",
                "uploadApproved",
                "architectureQualified",
                "frameworkQualified",
                "customKernelApproved",
            )
        ):
            raise ValueError("invalid qualification v2 executionGates")
        if (
            not isinstance(identity, dict)
            or any(not _sha(identity.get(k), 40) for k in ("modelRevision", "tokenizerRevision"))
            or not _sha(identity.get("templateHash"), 64)
            or not isinstance(identity.get("reasoningPolicy"), str)
        ):
            raise ValueError("invalid production recipeIdentity")
        if value.get("adapter") not in ("lora", "qlora", "full") or not isinstance(
            value.get("trainingArguments"), dict
        ):
            raise ValueError("invalid production adapter/trainingArguments")
        if value.get("adapter") == "qlora" and value.get("quantization") != "4bit":
            raise ValueError("QLoRA requires 4bit")
        if value.get("trustRemoteCode") and not gates["remoteCodeReviewed"]:
            raise ValueError("remote code review required")
    return value


def _sha(value: Any, n: int) -> bool:
    return isinstance(value, str) and len(value) == n and all(c in "0123456789abcdef" for c in value)


def parse_event(value: Any) -> dict[str, Any]:
    return _parse(value, "trainingEventVersion", ("sequence", "timestamp", "runId", "type"))


def parse_artifact_manifest(value: Any) -> dict[str, Any]:
    return _parse(value, "artifactManifestVersion", ("runId", "createdAt", "artifacts", "trainingSpecHash"))
