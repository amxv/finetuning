from __future__ import annotations

import json
import signal
import sys
import time
from pathlib import Path


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "malformed"
    config = json.loads(Path(mode).read_text()) if Path(mode).exists() else {}
    case = config.get("case", "malformed" if mode.endswith("malformed.json") else "cancel")
    track = config.get("track", "chat")
    version_key = "embeddingTrainingEventVersion" if track == "embedding" else "trainingEventVersion"
    version = "embedding.training.event.v1" if track == "embedding" else "1.0.0"
    marker = config.get("marker")
    if case == "malformed":
        print("not-json", flush=True)
    elif case in {"version", "sequence", "ignore-term"}:
        sequence = 1 if case == "sequence" else 0
        event_version = (
            "embedding.training.event.v2"
            if case == "version" and track == "embedding"
            else "2.0.0"
            if case == "version"
            else version
        )
        print(
            json.dumps(
                {
                    version_key: event_version,
                    "sequence": sequence,
                    "timestamp": "1970-01-01T00:00:00Z",
                    "runId": "case",
                    "type": "started",
                }
            ),
            flush=True,
        )
    if case in {"malformed", "version", "sequence", "ignore-term"}:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        time.sleep(0.8)
        if marker:
            Path(marker).write_text("orphan")
        return 0
    stopped = False

    def stop(_signal: int, _frame: object) -> None:
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    print(
        json.dumps(
            {
                version_key: version,
                "sequence": 0,
                "timestamp": "1970-01-01T00:00:00Z",
                "runId": "cancel",
                "type": "started",
            }
        ),
        flush=True,
    )
    while not stopped:
        time.sleep(0.01)
    print(
        json.dumps(
            {
                version_key: version,
                "sequence": 1,
                "timestamp": "1970-01-01T00:00:00Z",
                "runId": "cancel",
                "type": "failed",
                "data": {"reason": "cancelled"},
            }
        ),
        flush=True,
    )
    return 130


if __name__ == "__main__":
    raise SystemExit(main())
