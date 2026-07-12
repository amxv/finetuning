import unittest

from amxv_finetuning_trainer.framework import RECIPES, BiEncoder, manual_assistant_labels, require_execution_gates

try:
    import torch
except ImportError:
    torch = None


class FakeTokenizer:
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


class ModelRecipes(unittest.TestCase):
    def test_manual_mask_covers_only_assistant_spans_with_eos(self):
        messages = [
            {"role": "system", "tokens": [1]},
            {"role": "user", "tokens": [2, 3]},
            {"role": "assistant", "tokens": [4, 5]},
            {"role": "tool", "tokens": [6]},
            {"role": "assistant", "tokens": [7]},
        ]
        ids, labels = manual_assistant_labels(FakeTokenizer(), messages)
        self.assertEqual(ids, [10, 1, 99, 20, 2, 3, 99, 30, 4, 5, 99, 40, 6, 99, 30, 7, 99])
        self.assertEqual(labels, [-100] * 7 + [30, 4, 5, 99] + [-100] * 3 + [30, 7, 99])

    def test_manual_mask_fails_closed_on_template_drift_and_empty_assistant(self):
        with self.assertRaisesRegex(ValueError, "DRIFT"):
            manual_assistant_labels(
                DriftingTokenizer(), [{"role": "user", "tokens": [1]}, {"role": "assistant", "tokens": [2]}]
            )
        with self.assertRaisesRegex(ValueError, "EMPTY"):
            manual_assistant_labels(FakeTokenizer(), [{"role": "user", "tokens": [1]}])

    def test_version_two_gates_cover_mutating_and_evidence_boundaries(self):
        gates = {
            name: True
            for name in ("allowModelLoad", "licenseApproved", "revisionPinned", "remoteCodeReviewed", "gpuQualified")
        }
        with self.assertRaisesRegex(RuntimeError, "networkApproved"):
            require_execution_gates({"qualificationSchemaVersion": "2.0.0", "executionGates": gates})

    def test_all_recipe_revisions_are_exact_and_non_wave_recipes_block(self):
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
        for recipe_id in (
            "qwen3.6-35b-a3b",
            "nemotron-cascade-2-30b-a3b",
            "nemotron-3-nano-30b-a3b",
            "nomic-v2-moe-native",
        ):
            self.assertIn("first smoke wave", RECIPES[recipe_id]["blocked"])

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
