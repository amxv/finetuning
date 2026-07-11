import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

from amxv_finetuning_trainer.embedding_training import execute_production as embedding
from amxv_finetuning_trainer.engine import execute_production as chat


class Fake:
    def __init__(self):
        self.calls = []

    def load_tokenizer(self, *a, **k):
        self.calls.append("tokenizer")
        return type("T", (), {"chat_template": "fixture"})()

    def load_model(self, *a, **k):
        self.calls.append("model")
        return "model"

    def prepare_chat(self, r, t):
        self.calls.append("chat-data")
        return r

    def prepare_embedding(self, r, t, recipe):
        self.calls.append("embedding-data")
        return r, "collator"

    def wrap_embedding(self, m, r, d=None):
        self.calls.append("wrapper")
        return m

    def attach_adapter(self, m, c):
        self.calls.append("adapter")
        return "adapter"

    def train_sft(self, *a):
        self.calls.append("sft")
        return self

    def train_embedding(self, *a):
        self.calls.append("embedding")
        return self

    def save(self, t, o, **k):
        self.calls.append("save")
        o.mkdir(parents=True)
        (o / "adapter.safetensors").write_bytes(b"x")
        return ["adapter.safetensors"]


class Architecture(unittest.TestCase):
    def setUp(self):
        from amxv_finetuning_trainer import framework

        self.old = dict(framework.RECIPES)
        sha = "a" * 40
        framework.RECIPES["test-chat"] = {
            "track": "chat",
            "modelId": "fixture",
            "modelRevision": sha,
            "tokenizerRevision": sha,
            "templateHash": hashlib.sha256(b"fixture").hexdigest(),
            "roles": ["assistant"],
            "reasoning": "none",
            "lora": {"r": 8, "target_modules": ["q_proj"]},
        }
        framework.RECIPES["test-embedding"] = {
            "track": "embedding",
            "modelId": "fixture",
            "modelRevision": sha,
            "tokenizerRevision": sha,
            "pooling": "mean",
            "objective": "multiple-negatives",
            "dimensions": [2],
            "maxLength": 8,
            "queryPrefix": "",
            "documentPrefix": "",
            "lora": {"r": 8},
        }

    def tearDown(self):
        from amxv_finetuning_trainer import framework

        framework.RECIPES.clear()
        framework.RECIPES.update(self.old)

    def spec(self, root):
        return {
            "recipeId": "test-chat",
            "recipeIdentity": {
                "modelRevision": "a" * 40,
                "tokenizerRevision": "a" * 40,
                "templateHash": hashlib.sha256(b"fixture").hexdigest(),
                "reasoningPolicy": "none",
            },
            "executionGates": {
                "allowModelLoad": True,
                "licenseApproved": True,
                "revisionPinned": True,
                "remoteCodeReviewed": True,
                "gpuQualified": True,
            },
            "adapter": "qlora",
            "quantization": "4bit",
            "outputDirectory": str(root),
            "trainingArguments": {},
        }

    def test_chat_and_embedding_use_framework_boundary(self):
        with tempfile.TemporaryDirectory() as d:
            f = Fake()
            self.assertEqual(chat(self.spec(Path(d) / "c"), [{"messages": []}], f)["uploads"], False)
            self.assertEqual(f.calls, ["tokenizer", "model", "adapter", "chat-data", "sft", "save"])
            f = Fake()
            s = self.spec(Path(d) / "e")
            s["recipeId"] = "test-embedding"
            embedding(s, [{"query": "q", "document": "d"}], f)
            self.assertIn("embedding-data", f.calls)
            self.assertIn("embedding", f.calls)

    def test_gate_closes_before_framework(self):
        with tempfile.TemporaryDirectory() as d:
            s = self.spec(Path(d))
            s["executionGates"]["licenseApproved"] = False
            f = Fake()
            self.assertRaisesRegex(RuntimeError, "PRODUCTION_GATE_CLOSED", chat, s, [], f)
            self.assertEqual(f.calls, [])

    def test_normal_event_runner_reaches_injected_framework(self):
        from amxv_finetuning_trainer import runner

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            data = root / "data"
            data.mkdir()
            (data / "manifest.json").write_text("{}")
            (data / "records.jsonl").write_text(
                json.dumps({"messages": [{"role": "assistant", "content": "ok"}]}) + "\n"
            )
            spec = self.spec(root / "out")
            spec.update(
                {
                    "trainingSpecVersion": "1.0.0",
                    "runId": "r",
                    "dataset": {"manifestPath": str(data / "manifest.json"), "recordsHash": "a" * 64},
                    "objective": "sft",
                    "seed": 1,
                }
            )
            path = root / "spec.json"
            path.write_text(json.dumps(spec))
            old = sys.argv
            sys.argv = ["runner", str(path)]
            capture = io.StringIO()
            oldout = sys.stdout
            sys.stdout = capture
            try:
                self.assertEqual(runner.main(lambda: Fake()), 0)
            finally:
                sys.argv = old
                sys.stdout = oldout
            events = [json.loads(x) for x in capture.getvalue().splitlines()]
            self.assertEqual(events[-1]["type"], "completed")
            self.assertEqual(events[-1]["data"]["framework"], "huggingface")
