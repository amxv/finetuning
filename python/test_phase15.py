import json
import tempfile
import unittest
from pathlib import Path

from amxv_finetuning_trainer.embedding_training import (
    SPEC_VERSION,
    checkpoint_classification,
    export,
    losses,
    parse_spec,
    train,
    verify,
)


class Phase15(unittest.TestCase):
    def spec(self, root):
        return {
            "embeddingTrainingSpecVersion": SPEC_VERSION,
            "runId": "r",
            "datasetManifest": str(root / "manifest.json"),
            "recipeId": "cpu-tiny-embedding-fixture",
            "objective": "multiple-negatives",
            "outputDirectory": str(root / "out"),
            "effectiveBatchSize": 2,
            "immutableIdentity": {
                "modelRevision": "fixture",
                "tokenizerRevision": "fixture",
                "configRevision": "fixture",
                "dataHash": "a" * 64,
                "splitHash": "b" * 64,
                "taskMapping": "pair",
                "prompts": {"query": "q:", "document": ""},
                "pooling": "mean",
                "padding": "right",
                "normalization": "l2",
                "dimensions": [2],
                "objective": "multiple-negatives",
                "seed": 7,
            },
            "allowedRuntimeChanges": ["operation", "checkpointPath"],
        }

    def test_protocol_losses_resume_export_tamper(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "manifest.json").write_text("{}\n")
            (root / "records.jsonl").write_text(
                json.dumps({"query": {"text": "hello"}, "document": {"text": "world"}}) + "\n"
            )
            spec = self.spec(root)
            self.assertIs(parse_spec(spec), spec)
            self.assertAlmostEqual(losses("mse", [1, 0], [0, 0]), 0.5)
            first = train(spec)
            checkpoint = root / "out" / f"checkpoint-{first['globalStep']}.json"
            self.assertEqual(checkpoint_classification(checkpoint, first["identityHash"]), "full-resume")
            resumed = train(spec, checkpoint)
            self.assertEqual(first["weight"], resumed["weight"])
            warm = json.loads(checkpoint.read_text())
            warm.pop("optimizer")
            (root / "warm.json").write_text(json.dumps(warm))
            self.assertEqual(
                checkpoint_classification(root / "warm.json", first["identityHash"]), "weights-only-warm-start"
            )
            manifest = export(spec)
            self.assertEqual(verify(root / "out" / "embedding-artifact-manifest.json"), manifest)
            (root / "out" / "model.json").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "TAMPER"):
                verify(root / "out" / "embedding-artifact-manifest.json")
            with self.assertRaisesRegex(ValueError, "VERSION"):
                parse_spec({**spec, "embeddingTrainingSpecVersion": "embedding.training.v2"})
            manifest["artifacts"] = [{"path": "../records.jsonl", "sha256": "a" * 64, "bytes": 1, "kind": "file"}]
            (root / "out" / "embedding-artifact-manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "PATH"):
                verify(root / "out" / "embedding-artifact-manifest.json")


if __name__ == "__main__":
    unittest.main()
