from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

REQUIRED_STATE = ("trainer_state.json", "optimizer.pt", "scheduler.pt", "rng_state.pth")
MODEL_FILES = ("adapter_model.safetensors", "pytorch_model.bin", "model.safetensors")
MODEL_INDEXES = ("pytorch_model.bin.index.json", "model.safetensors.index.json", "adapter_model.safetensors.index.json")


def checkpoint_inventory(root: Path) -> list[dict[str, Any]]:
    if not root.is_dir():
        raise ValueError("CHECKPOINT_DIRECTORY_MISSING")
    files = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        if path.is_symlink():
            raise ValueError("CHECKPOINT_SYMLINK_REFUSED")
        if not path.is_file():
            continue
        payload = path.read_bytes()
        files.append(
            {
                "path": path.relative_to(root).as_posix(),
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    names = {item["path"] for item in files}
    if any(name not in names for name in REQUIRED_STATE):
        raise ValueError("CHECKPOINT_STATE_INCOMPLETE")
    indexes = [name for name in MODEL_INDEXES if name in names]
    if not any(name in names for name in MODEL_FILES) and not indexes:
        raise ValueError("CHECKPOINT_MODEL_INCOMPLETE")
    for name in indexes:
        try:
            index = json.loads((root / name).read_text())
            shards = set(index["weight_map"].values())
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise ValueError("CHECKPOINT_INDEX_CORRUPT") from error
        if not shards or not shards.issubset(names):
            raise ValueError("CHECKPOINT_SHARD_MISSING")
    return files


def verify_inventory(root: Path, expected: Any) -> None:
    if not isinstance(expected, list) or not expected:
        raise ValueError("CHECKPOINT_INVENTORY_MISSING")
    actual = checkpoint_inventory(root)
    if actual != expected:
        raise ValueError("CHECKPOINT_INTEGRITY_MISMATCH")


def checkpoint_step(path: Path) -> int | None:
    match = re.fullmatch(r"checkpoint-(\d+)", path.name)
    return int(match.group(1)) if match else None
