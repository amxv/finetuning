"""Phase 6 cross-language contracts and offline template auditing."""
from .contracts import parse_artifact_manifest, parse_event, parse_spec

__all__ = ["parse_artifact_manifest", "parse_event", "parse_spec"]
from .execution_contracts import JOB_VERSION, canonical_job_hash, classify_resume, parse_execution_job
