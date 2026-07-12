from __future__ import annotations

import json
import sys
from pathlib import Path

from .contracts import parse_spec
from .engine import classify_checkpoint, execute_production, export_artifacts, preflight, resume_identity_hash, train
from .framework import HuggingFaceFramework


def main(framework_factory=HuggingFaceFramework) -> int:
    spec = parse_spec(json.loads(Path(sys.argv[1]).read_text()))
    sequence = 0

    def emit(kind: str, data: dict | None = None) -> None:
        nonlocal sequence
        print(
            json.dumps(
                {
                    "trainingEventVersion": "1.0.0",
                    "sequence": sequence,
                    "timestamp": "1970-01-01T00:00:00Z",
                    "runId": spec["runId"],
                    "type": kind,
                    **({"data": data} if data else {}),
                }
            ),
            flush=True,
        )
        sequence += 1

    emit("started")
    operation = spec.get("operation", "run")
    try:
        if operation == "resume":
            checkpoint = spec.get("checkpointPath")
            if not checkpoint:
                raise ValueError("CHECKPOINT_REQUIRED: resume requires checkpointPath")
            classification = classify_checkpoint(Path(checkpoint), resume_identity_hash(spec))
            if classification != "full-resume":
                raise ValueError(f"CHECKPOINT_NOT_FULL_RESUME: {classification}")
        production = spec["recipeId"] != "cpu-tiny-fixture"
        info = (
            {"mode": "production-gated", "recipeId": spec["recipeId"], "network": False, "uploads": False}
            if production
            else preflight(spec)
        )
        emit("preflight", info)
        if operation == "prepare":
            result = info
        elif operation in ("run", "resume"):
            if production:
                records = Path(spec["dataset"]["manifestPath"]).parent / "records.jsonl"
                rows = [json.loads(x) for x in records.read_text().splitlines() if x.strip()]
                result = execute_production(spec, rows, framework_factory())
            else:
                result = train(spec, Path(spec["checkpointPath"]) if operation == "resume" else None)
            emit("progress", result)
        elif operation == "status":
            result = {
                "checkpointClassification": classify_checkpoint(
                    Path(spec["checkpointPath"]), resume_identity_hash(spec)
                )
                if spec.get("checkpointPath")
                else "none"
            }
        elif operation == "evaluate":
            result = json.loads((Path(spec["outputDirectory"]) / "evaluation.json").read_text())
        else:
            result = export_artifacts(spec)
            emit("artifact", {"manifest": "artifact-manifest.json"})
        emit("completed", result)
        return 0
    except Exception as error:
        emit(
            "failed",
            {
                "classification": "OOM_FALLBACK" if isinstance(error, MemoryError) else "ACTIONABLE_FAILURE",
                "message": str(error),
            },
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
