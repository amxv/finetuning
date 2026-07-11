from __future__ import annotations
from typing import Any

VERSIONS = {"trainingSpecVersion":"1.0.0","trainingEventVersion":"1.0.0","artifactManifestVersion":"1.0.0"}
def _parse(value: Any, version_key: str, required: tuple[str,...]) -> dict[str,Any]:
    if not isinstance(value,dict): raise ValueError("contract must be an object")
    actual=value.get(version_key)
    if not isinstance(actual,str) or actual.split(".")[0] != VERSIONS[version_key].split(".")[0]: raise ValueError(f"incompatible {version_key} major version")
    missing=[key for key in required if key not in value]
    if missing: raise ValueError(f"missing fields: {', '.join(missing)}")
    return value
def parse_spec(value: Any)->dict[str,Any]: return _parse(value,"trainingSpecVersion",("runId","dataset","recipeId","outputDirectory","objective","seed"))
def parse_event(value: Any)->dict[str,Any]: return _parse(value,"trainingEventVersion",("sequence","timestamp","runId","type"))
def parse_artifact_manifest(value: Any)->dict[str,Any]: return _parse(value,"artifactManifestVersion",("runId","createdAt","artifacts","trainingSpecHash"))
