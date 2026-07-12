from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from amxv_finetuning_trainer.engine import (
    classify_checkpoint,
    discover_lora_targets,
    export_artifacts,
    preflight,
    reload_parity,
    render_and_mask,
    sft_collate,
    train,
    verify_artifacts,
)


class Tokenizer:
    def apply_chat_template(self, messages, **kwargs):
        return {"input_ids": [1, 2, 3], "assistant_masks": [0, 1, 1]}


class Phase7(unittest.TestCase):
    def fixture(self, root: Path, name: str) -> dict:
        frozen = root / "frozen"
        frozen.mkdir(exist_ok=True)
        (frozen / "records.jsonl").write_text(
            json.dumps(
                {
                    "messages": [
                        {"role": "user", "content": [{"type": "text", "text": "hello"}]},
                        {"role": "assistant", "content": [{"type": "text", "text": "answer"}]},
                    ]
                }
            )
            + "\n"
        )
        (frozen / "manifest.json").write_text("{}")
        return {
            "trainingSpecVersion": "1.0.0",
            "runId": name,
            "dataset": {"manifestPath": str(frozen / "manifest.json"), "recordsHash": "a" * 64},
            "recipeId": "cpu-tiny-fixture",
            "outputDirectory": str(root / name),
            "objective": "sft",
            "seed": 7,
            "quantization": "bf16",
        }

    def test_cpu_train_resume_evaluate_export_reload_and_tamper(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            full = train(self.fixture(root, "full"))
            resume_spec = self.fixture(root, "resumed")
            resumed = train(resume_spec, root / "full" / "checkpoint-1.json")
            self.assertAlmostEqual(full["metric"], resumed["metric"], places=12)
            self.assertEqual(resumed["resumeClassification"], "full-resume")
            self.assertTrue(reload_parity(root / "resumed" / "adapter.json", 0.5))
            manifest = export_artifacts(resume_spec)
            self.assertEqual(verify_artifacts(root / "resumed" / "artifact-manifest.json"), manifest)
            (root / "resumed" / "adapter.json").write_text("tampered")
            self.assertRaises(ValueError, verify_artifacts, root / "resumed" / "artifact-manifest.json")

    def test_masks_collator_targets_and_checkpoint_classification(self):
        ids, labels = render_and_mask([{"role": "assistant", "content": "x"}], Tokenizer())
        self.assertEqual(labels, [-100, 2, 3])
        self.assertEqual(sft_collate([(ids, labels), ([1], [-100])])["attention_mask"], [[1, 1, 1], [1, 0, 0]])
        self.assertEqual(discover_lora_targets(["x.q_proj", "x.norm"]), ["x.q_proj"])
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "warm.json"
            path.write_text(json.dumps({"model": {"weight": 1}}))
            self.assertEqual(classify_checkpoint(path), "weights-only")

    def test_resume_identity_rejects_changed_immutable_semantics_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root, "source")
            train(source)
            checkpoint = root / "source" / "checkpoint-1.json"
            for field, value in (("seed", 8), ("recipeId", "other-fixture"), ("trainingArguments", {"epochs": 9})):
                target = self.fixture(root, f"changed-{field}")
                target[field] = value
                output = Path(target["outputDirectory"])
                with self.assertRaisesRegex(ValueError, "CHECKPOINT_INCOMPATIBLE: incompatible"):
                    train(target, checkpoint)
                self.assertFalse(output.exists())
            target = self.fixture(root, "changed-dataset")
            target["dataset"] = {**target["dataset"], "recordsHash": "b" * 64}
            with self.assertRaisesRegex(ValueError, "CHECKPOINT_INCOMPATIBLE: incompatible"):
                train(target, checkpoint)
            self.assertFalse(Path(target["outputDirectory"]).exists())

    def test_production_and_hardware_preflight_are_actionable(self):
        with tempfile.TemporaryDirectory() as d:
            spec = self.fixture(Path(d), "x")
            spec.update(
                {
                    "recipeId": "qwen3.6-27b",
                    "adapter": "qlora",
                    "quantization": "4bit",
                    "trainingArguments": {},
                    "executionGates": {
                        "allowModelLoad": False,
                        "licenseApproved": False,
                        "revisionPinned": False,
                        "remoteCodeReviewed": False,
                        "gpuQualified": False,
                    },
                    "recipeIdentity": {
                        "modelRevision": "a" * 40,
                        "tokenizerRevision": "a" * 40,
                        "templateHash": "b" * 64,
                        "reasoningPolicy": "none",
                    },
                }
            )
            self.assertRaisesRegex(RuntimeError, "UNRESOLVED_RECIPE", preflight, spec)

    def test_artifact_paths_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            outside = root / "outside"
            outside.write_text("secret")
            art = root / "art"
            art.mkdir()
            manifest = {
                "artifactManifestVersion": "1.0.0",
                "runId": "r",
                "createdAt": "x",
                "trainingSpecHash": "a" * 64,
                "artifacts": [{"path": "../outside", "sha256": "a" * 64, "bytes": 6, "kind": "file"}],
            }
            path = art / "artifact-manifest.json"
            path.write_text(json.dumps(manifest))
            self.assertRaisesRegex(ValueError, "unsafe artifact path", verify_artifacts, path)
            target = art / "target"
            target.write_text("ok")
            (art / "link").symlink_to(target)
            manifest["artifacts"][0] = {"path": "link", "sha256": "a" * 64, "bytes": 2, "kind": "file"}
            path.write_text(json.dumps(manifest))
            self.assertRaisesRegex(ValueError, "symlink", verify_artifacts, path)


if __name__ == "__main__":
    unittest.main()
