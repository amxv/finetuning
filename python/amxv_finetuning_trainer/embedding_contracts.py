from __future__ import annotations

import hashlib
import json
import math


def canonical_hash(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def validate_record(r):
    required = (
        "embeddingRecordVersion",
        "id",
        "kind",
        "task",
        "split",
        "splitGroup",
        "source",
        "transformations",
        "createdAt",
    )
    if any(k not in r for k in required):
        raise ValueError("EMBED_PROVENANCE_REQUIRED")
    if r["embeddingRecordVersion"] != "1.0.0" or r["split"] not in ("train", "validation", "test"):
        raise ValueError("EMBED_VERSION")
    source = r["source"]
    if not all(source.get(k) for k in ("source", "revision", "license", "rights")):
        raise ValueError("EMBED_PROVENANCE_REQUIRED")
    if r["kind"] in ("scored-pair", "sts"):
        scale = r.get("scale")
        if not scale or not scale["min"] < scale["max"] or not scale["min"] <= r["score"] <= scale["max"]:
            raise ValueError("EMBED_SCORE_SCALE")
    if r["kind"] == "teacher-ranking":
        ids = {x["id"] for x in r["candidates"]}
        if not r.get("candidatePoolId") or not r.get("corpusId") or any(x not in ids for x in r["ranking"]):
            raise ValueError("EMBED_RANKING_POOL")
    if r["kind"] == "teacher-vector" and r["vector"]["storage"] == "inline":
        v = r["vector"]
        if len(v["values"]) != v["dimension"] or not all(math.isfinite(x) for x in v["values"]):
            raise ValueError("EMBED_VECTOR_SHAPE")
        if v["norm"] == "l2" and abs(math.sqrt(sum(x * x for x in v["values"])) - 1) > 1e-5:
            raise ValueError("EMBED_VECTOR_NORM")
    return r
