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
        ):
            raise ValueError("invalid qualification v2 executionGates")
        if value.get("qualificationSchemaVersion") == "2.0.0":
            authorization = value.get("qualificationAuthorization")
            if (
                not isinstance(authorization, dict)
                or authorization.get("state") not in ("smokeAuthorized", "smokePassed", "qualified")
                or authorization.get("recipeId") != value["recipeId"]
                or not _sha(authorization.get("recipeIdentityHash"), 64)
                or not _sha(authorization.get("evidenceDigest"), 64)
                or not isinstance(authorization.get("dischargedBlockers"), list)
                or any(not isinstance(item, str) for item in authorization["dischargedBlockers"])
                or not isinstance(authorization.get("storePath"), str)
                or not _sha(authorization.get("storeSha256"), 64)
                or not _sha(authorization.get("trustPolicySha256"), 64)
                or not isinstance(authorization.get("expiresAt"), str)
                or not _sha(authorization.get("architectureEvidenceSha256"), 64)
                or authorization.get("operationClass") not in ("mechanicsSmoke", "qualificationRun", "experimentalUse")
                or authorization.get("operation") not in ("run", "resume", "evaluate", "export")
                or authorization.get("operation") != value.get("operation", "run")
                or authorization.get("outputDirectory") != value.get("outputDirectory")
                or not _sha(authorization.get("artifactSha256"), 64)
                or not _evidence_bindings(authorization.get("evidenceBindings"))
                or not isinstance(authorization.get("signerKeyId"), str)
                or not isinstance(authorization.get("authorizationSignatureBase64"), str)
                or not isinstance(authorization.get("sequence"), int)
                or authorization["sequence"] < 1
            ):
                raise ValueError("invalid qualification v2 authorization evidence")
            phase = {
                "smokeAuthorized": ("mechanicsSmoke", ("run", "resume")),
                "smokePassed": ("qualificationRun", ("run", "resume", "evaluate", "export")),
                "qualified": ("experimentalUse", ("evaluate", "export")),
            }[authorization["state"]]
            if authorization["operationClass"] != phase[0] or authorization["operation"] not in phase[1]:
                raise ValueError("qualification operation is not authorized for current state")
            if gates["uploadRequested"] is False and gates["uploadApproved"] is not False:
                raise ValueError("no-upload execution requires uploadApproved=false")
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


def _evidence_bindings(value: Any) -> bool:
    keys = (
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
    return isinstance(value, dict) and set(value) == set(keys) and all(_sha(value.get(key), 64) for key in keys)


def parse_event(value: Any) -> dict[str, Any]:
    return _parse(value, "trainingEventVersion", ("sequence", "timestamp", "runId", "type"))


def parse_artifact_manifest(value: Any) -> dict[str, Any]:
    return _parse(value, "artifactManifestVersion", ("runId", "createdAt", "artifacts", "trainingSpecHash"))
