import hashlib
import hmac
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from amxv_finetuning_trainer.framework import (
    RECIPES,
    BiEncoder,
    HuggingFaceFramework,
    manual_assistant_labels,
    require_execution_gates,
)

try:
    import torch
except ImportError:
    torch = None


class FakeTokenizer:
    eos_token_id = 99
    pad_token_id = 0

    def apply_chat_template(self, messages, tokenize=True, add_generation_prompt=False):
        del tokenize, add_generation_prompt
        result = []
        role = {"system": 10, "user": 20, "assistant": 30, "tool": 40}
        for message in messages:
            result.extend([role[message["role"]], *message["tokens"], 99])
        return result


class DriftingTokenizer(FakeTokenizer):
    def apply_chat_template(self, messages, tokenize=True, add_generation_prompt=False):
        result = super().apply_chat_template(messages, tokenize, add_generation_prompt)
        if len(messages) > 1:
            result[0] = 11
        return result


class NonTerminalEosTokenizer(FakeTokenizer):
    def apply_chat_template(self, messages, tokenize=True, add_generation_prompt=False):
        result = super().apply_chat_template(messages, tokenize, add_generation_prompt)
        if messages[-1]["role"] == "assistant":
            result.extend([55])
        return result


class ModelRecipes(unittest.TestCase):
    def test_manual_mask_covers_only_assistant_spans_with_eos(self):
        messages = [
            {"role": "system", "tokens": [1], "content": "policy"},
            {"role": "user", "tokens": [2, 3], "content": "question"},
            {"role": "assistant", "tokens": [4, 5], "content": "<think>reason</think> answer"},
            {"role": "tool", "tokens": [6], "content": "result"},
            {"role": "assistant", "tokens": [7], "content": "final"},
        ]
        ids, labels = manual_assistant_labels(FakeTokenizer(), messages)
        self.assertEqual(ids, [10, 1, 99, 20, 2, 3, 99, 30, 4, 5, 99, 40, 6, 99, 30, 7, 99])
        self.assertEqual(labels, [-100] * 7 + [30, 4, 5, 99] + [-100] * 3 + [30, 7, 99])

    def test_manual_mask_fails_closed_on_template_drift_and_empty_assistant(self):
        with self.assertRaisesRegex(ValueError, "DRIFT"):
            manual_assistant_labels(
                DriftingTokenizer(),
                [{"role": "user", "tokens": [1], "content": "q"}, {"role": "assistant", "tokens": [2], "content": "a"}],
            )
        with self.assertRaisesRegex(ValueError, "EMPTY"):
            manual_assistant_labels(FakeTokenizer(), [{"role": "user", "tokens": [1]}])
        with self.assertRaisesRegex(ValueError, "EMPTY_ASSISTANT"):
            manual_assistant_labels(
                FakeTokenizer(),
                [{"role": "user", "tokens": [1], "content": "q"}, {"role": "assistant", "tokens": [], "content": ""}],
            )
        with self.assertRaisesRegex(ValueError, "TERMINAL_SEQUENCE"):
            manual_assistant_labels(
                NonTerminalEosTokenizer(),
                [
                    {"role": "user", "tokens": [1], "content": "q"},
                    {"role": "assistant", "tokens": [99, 2], "content": "contains eos internally"},
                ],
            )
        ids, labels = manual_assistant_labels(
            NonTerminalEosTokenizer(),
            [
                {"role": "user", "tokens": [1], "content": "q"},
                {"role": "assistant", "tokens": [2], "content": "custom terminal"},
            ],
            terminal_token_ids=[55],
        )
        self.assertEqual(labels[-1], ids[-1])

    def test_version_two_gates_cover_mutating_and_evidence_boundaries(self):
        gates = {
            name: True
            for name in ("allowModelLoad", "licenseApproved", "revisionPinned", "remoteCodeReviewed", "gpuQualified")
        }
        with self.assertRaisesRegex(RuntimeError, "experimentalExecutionApproved"):
            require_execution_gates({"qualificationSchemaVersion": "2.0.0", "executionGates": gates})

    def test_python_execution_requires_independent_hmac_and_signed_architecture_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store_path = root / "store.json"
            architecture = {"inventorySha256": "d" * 64, "resolvedTargetModules": ["q_proj"]}
            architecture_hash = hashlib.sha256(
                json.dumps(architecture, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            gates = {
                name: True
                for name in (
                    "allowModelLoad",
                    "licenseApproved",
                    "revisionPinned",
                    "remoteCodeReviewed",
                    "gpuQualified",
                    "experimentalExecutionApproved",
                    "stagingNetworkApproved",
                    "downloadsApproved",
                    "remoteCodeApproved",
                    "gpuApproved",
                    "budgetApproved",
                    "datasetRightsApproved",
                    "modelLicenseAccepted",
                    "architectureEvidenceApproved",
                    "frameworkEvidenceApproved",
                    "customKernelApproved",
                )
            }
            gates.update({"uploadRequested": False, "uploadApproved": False})
            current_evidence = {
                "recipeId": "qwen3-embed-0.6b-lora",
                "recipeIdentityHash": "a" * 64,
                "trustPolicySha256": "b" * 64,
                "expiresAt": "2099-01-01T00:00:00Z",
                "bindings": {"targetInventorySha256": architecture["inventorySha256"]},
                "authorization": {
                    "gates": {
                        name: gates[name]
                        for name in gates
                        if name
                        not in (
                            "allowModelLoad",
                            "licenseApproved",
                            "revisionPinned",
                            "remoteCodeReviewed",
                            "gpuQualified",
                        )
                    },
                    "dischargedBlockers": ["reviewed"],
                },
            }
            evidence_digest = hashlib.sha256(
                json.dumps(current_evidence, separators=(",", ":"), ensure_ascii=False).encode()
            ).hexdigest()
            store = {
                "storeVersion": "2.0.0",
                "trustPolicySha256": "b" * 64,
                "recipes": {
                    "qwen3-embed-0.6b-lora": {
                        "state": "smokeAuthorized",
                        "sequence": 1,
                        "currentDigest": evidence_digest,
                        "acceptedEvidence": [current_evidence],
                    }
                },
            }
            store_path.write_text(json.dumps(store))
            authorization = {
                "state": "smokeAuthorized",
                "recipeId": "qwen3-embed-0.6b-lora",
                "recipeIdentityHash": "a" * 64,
                "evidenceDigest": evidence_digest,
                "sequence": 1,
                "dischargedBlockers": ["reviewed"],
                "storePath": str(store_path),
                "storeSha256": hashlib.sha256(store_path.read_bytes()).hexdigest(),
                "trustPolicySha256": "b" * 64,
                "expiresAt": "2099-01-01T00:00:00Z",
                "architectureEvidenceSha256": architecture_hash,
            }
            payload = {
                "recipeId": authorization["recipeId"],
                "recipeIdentityHash": authorization["recipeIdentityHash"],
                "evidenceDigest": authorization["evidenceDigest"],
                "sequence": authorization["sequence"],
                "dischargedBlockers": authorization["dischargedBlockers"],
                "storeSha256": authorization["storeSha256"],
                "trustPolicySha256": authorization["trustPolicySha256"],
                "expiresAt": authorization["expiresAt"],
                "architectureEvidenceSha256": architecture_hash,
                "executionGates": gates,
            }
            authorization["authorizationHmacSha256"] = hmac.new(
                b"admin-secret",
                json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(),
                hashlib.sha256,
            ).hexdigest()
            spec = {
                "qualificationSchemaVersion": "2.0.0",
                "recipeId": authorization["recipeId"],
                "executionGates": gates,
                "qualificationAuthorization": authorization,
                "architectureEvidence": architecture,
            }
            with patch.dict(
                "os.environ",
                {
                    "AMXV_QUALIFICATION_TRUST_POLICY_SHA256": "b" * 64,
                    "AMXV_QUALIFICATION_AUTH_HMAC_KEY": "admin-secret",
                },
                clear=False,
            ):
                require_execution_gates(spec)
                spec["executionGates"]["budgetApproved"] = False
                with self.assertRaisesRegex(RuntimeError, "PRODUCTION_GATE_CLOSED"):
                    require_execution_gates(spec)
                spec["executionGates"]["budgetApproved"] = True
                spec["architectureEvidence"]["inventorySha256"] = "e" * 64
                with self.assertRaisesRegex(RuntimeError, "ARCHITECTURE_EVIDENCE_MISMATCH"):
                    require_execution_gates(spec)

    def test_all_recipe_revisions_are_exact_and_non_wave_recipes_block(self):
        evidence = json.loads((Path(__file__).parent / "amxv_finetuning_trainer" / "recipe-evidence.json").read_text())[
            "recipes"
        ]
        self.assertEqual(set(evidence), set(RECIPES))
        for recipe_id in (
            "qwen3.6-27b",
            "qwen3.6-35b-a3b",
            "nemotron-cascade-2-30b-a3b",
            "nemotron-3-nano-30b-a3b",
            "olmo-3.1-32b-instruct",
            "olmo-3.1-32b-think",
            "qwen3-embed-0.6b-lora",
            "arctic-m-v2-full",
            "bge-m3-dense",
            "nomic-v2-moe-native",
            "gte-multilingual-base-full",
        ):
            self.assertRegex(RECIPES[recipe_id]["modelRevision"], r"^[0-9a-f]{40}$")
            self.assertEqual(evidence[recipe_id]["modelRevision"], RECIPES[recipe_id]["modelRevision"])
            self.assertEqual(evidence[recipe_id]["supportState"], "unavailable")
            self.assertEqual(evidence[recipe_id]["qualificationState"], "configured")
        for recipe_id in (
            "qwen3.6-35b-a3b",
            "nemotron-cascade-2-30b-a3b",
            "nemotron-3-nano-30b-a3b",
            "nomic-v2-moe-native",
        ):
            self.assertIn("first smoke wave", RECIPES[recipe_id]["blocked"])

    def test_embedding_recipe_applies_prompt_padding_normalization_and_rejects_mixed_negatives(self):
        class Dataset:
            @staticmethod
            def from_list(rows):
                return rows

        class Tokenizer:
            padding_side = "right"

            def __call__(self, text, **kwargs):
                return {"text": text, **kwargs}

            def pad(self, rows, return_tensors):
                return {"rows": rows, "return_tensors": return_tensors}

        framework = HuggingFaceFramework.__new__(HuggingFaceFramework)
        framework.Dataset = Dataset
        tokenizer = Tokenizer()
        recipe = RECIPES["qwen3-embed-0.6b-lora"]
        self.assertEqual(recipe["normalization"], "l2")
        dataset, collate = framework.prepare_embedding(
            [
                {"query": "q1", "document": "d1", "hardNegative": "n1"},
                {"query": "q2", "document": "d2"},
            ],
            tokenizer,
            recipe,
        )
        self.assertEqual(tokenizer.padding_side, "left")
        self.assertEqual(
            dataset[0]["query"]["text"],
            "Instruct: Given a web search query, retrieve relevant passages that answer the query.\nQuery:q1",
        )
        self.assertEqual(dataset[0]["document"]["text"], "d1")
        with self.assertRaisesRegex(ValueError, "MIXED_HARD_NEGATIVES"):
            collate(dataset)

    @unittest.skipIf(torch is None, "torch optional dependency is unavailable")
    def test_contrastive_matryoshka_loss_uses_hard_and_in_batch_negatives(self):
        class Encoder(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.scale = torch.nn.Parameter(torch.tensor(1.0))

            def forward(self, input_ids, attention_mask):
                del attention_mask
                hidden = torch.nn.functional.one_hot(input_ids, num_classes=4).float() * self.scale
                return type("Output", (), {"last_hidden_state": hidden})()

        model = BiEncoder(Encoder(), "mean", dimensions=[4, 2], normalize=True, temperature=0.1)
        batch = {
            "input_ids": torch.tensor([[0, 0], [1, 1]]),
            "attention_mask": torch.ones((2, 2), dtype=torch.long),
        }
        negatives = {
            "input_ids": torch.tensor([[2, 2], [3, 3]]),
            "attention_mask": torch.ones((2, 2), dtype=torch.long),
        }
        result = model(query=batch, document=batch, hard_negative=negatives)
        self.assertTrue(torch.isfinite(result["loss"]))
        self.assertEqual(tuple(result["logits"].shape), (2, 4))
        result["loss"].backward()


if __name__ == "__main__":
    unittest.main()
