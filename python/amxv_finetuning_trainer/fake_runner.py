from __future__ import annotations

import hashlib
import json
import signal
import sys
from pathlib import Path

from .contracts import parse_spec

cancelled = False


def _cancel(_signum: int, _frame: object) -> None:
    global cancelled
    cancelled = True


def main() -> int:
    signal.signal(signal.SIGTERM, _cancel)
    signal.signal(signal.SIGINT, _cancel)
    if len(sys.argv) != 2:
        raise ValueError("usage: fake_runner SPEC_PATH")
    spec = parse_spec(json.loads(Path(sys.argv[1]).read_text()))

    def emit(sequence: int, event_type: str, data: dict | None = None) -> None:
        print(
            json.dumps(
                {
                    "trainingEventVersion": "1.0.0",
                    "sequence": sequence,
                    "timestamp": "1970-01-01T00:00:00Z",
                    "runId": spec["runId"],
                    "type": event_type,
                    **({"data": data} if data else {}),
                }
            ),
            flush=True,
        )

    emit(0, "started")
    emit(1, "preflight", {"mode": "fake"})
    if cancelled:
        emit(2, "failed", {"reason": "cancelled"})
        return 130
    output = Path(spec["outputDirectory"])
    output.mkdir(parents=True, exist_ok=True)
    payload = b"fake artifact\n"
    (output / "artifact.txt").write_bytes(payload)
    manifest = {
        "artifactManifestVersion": "1.0.0",
        "runId": spec["runId"],
        "createdAt": "1970-01-01T00:00:00Z",
        "artifacts": [
            {
                "path": "artifact.txt",
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
                "kind": "fixture",
            }
        ],
        "trainingSpecHash": hashlib.sha256(
            json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
    }
    (output / "artifact-manifest.json").write_text(json.dumps(manifest) + "\n")
    emit(2, "artifact", {"manifest": "artifact-manifest.json"})
    emit(3, "completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
