from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .contracts import parse_spec
from .engine import classify_checkpoint, export_artifacts, preflight, train, verify_artifacts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "run", "resume", "status", "evaluate", "export", "verify"])
    parser.add_argument("spec")
    parser.add_argument("--checkpoint")
    args = parser.parse_args()
    spec = parse_spec(json.loads(Path(args.spec).read_text()))
    try:
        if args.command == "prepare":
            result = preflight(spec)
        elif args.command == "run":
            result = train(spec)
        elif args.command == "resume":
            result = train(spec, Path(args.checkpoint) if args.checkpoint else None)
        elif args.command == "status":
            result = {
                "checkpointClassification": classify_checkpoint(Path(args.checkpoint)) if args.checkpoint else "none"
            }
        elif args.command == "evaluate":
            result = json.loads((Path(spec["outputDirectory"]) / "evaluation.json").read_text())
        elif args.command == "export":
            result = export_artifacts(spec)
        else:
            result = verify_artifacts(Path(spec["outputDirectory"]) / "artifact-manifest.json")
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ValueError, RuntimeError, MemoryError) as error:
        kind = "OOM_FALLBACK" if isinstance(error, MemoryError) else "PREFLIGHT_OR_RUNTIME"
        print(json.dumps({"error": kind, "message": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
