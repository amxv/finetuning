import math
import tempfile
import unittest

import torch
from transformers import Trainer, TrainingArguments

from amxv_finetuning_trainer.framework import RECIPES, BiEncoder


class TinyEncoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.embeddings = torch.nn.Parameter(
            torch.tensor([[1.0, 0.2, 0.1, 0.0], [0.1, 1.0, 0.2, 0.0], [0.0, 0.1, 1.0, 0.2], [0.2, 0.0, 0.1, 1.0]])
        )

    def forward(self, input_ids, attention_mask):
        del attention_mask
        hidden = self.embeddings[input_ids]
        return type("Output", (), {"last_hidden_state": hidden})()


def batch(ids, mask):
    return {"input_ids": torch.tensor(ids), "attention_mask": torch.tensor(mask)}


class TorchObjective(unittest.TestCase):
    def test_qwen_recipe_left_padding_matryoshka_and_hard_negative_math(self):
        recipe = RECIPES["qwen3-embed-0.6b-lora"]
        self.assertEqual((recipe["paddingSide"], recipe["normalization"]), ("left", "l2"))
        encoder = TinyEncoder()
        model = BiEncoder(encoder, recipe["pooling"], dimensions=[4, 2], normalize=True, temperature=0.5)
        query = batch([[3, 0], [3, 1]], [[0, 1], [0, 1]])
        document = batch([[2, 0], [2, 1]], [[0, 1], [0, 1]])
        negatives = batch([[3, 2], [3, 3]], [[0, 1], [0, 1]])
        result = model(query=query, document=document, hard_negative=negatives)
        q_full = torch.nn.functional.normalize(encoder.embeddings[[0, 1]], dim=-1)
        d_full = torch.nn.functional.normalize(encoder.embeddings[[0, 1]], dim=-1)
        n_full = torch.nn.functional.normalize(encoder.embeddings[[2, 3]], dim=-1)
        expected_losses = []
        for dimension in (4, 2):
            q = torch.nn.functional.normalize(q_full[:, :dimension], dim=-1)
            d = torch.nn.functional.normalize(d_full[:, :dimension], dim=-1)
            n = torch.nn.functional.normalize(n_full[:, :dimension], dim=-1)
            logits = q @ torch.cat((d, n)).T / 0.5
            expected_losses.append(torch.nn.functional.cross_entropy(logits, torch.arange(2)))
        expected = torch.stack(expected_losses).mean()
        self.assertTrue(math.isclose(result["loss"].item(), expected.item(), rel_tol=1e-6))
        self.assertEqual(tuple(result["logits"].shape), (2, 4))
        result["loss"].backward()
        self.assertTrue(torch.isfinite(encoder.embeddings.grad).all())
        self.assertGreater(torch.count_nonzero(encoder.embeddings.grad).item(), 0)

    def test_actual_transformers_trainer_consumes_objective_loss(self):
        model = BiEncoder(TinyEncoder(), "cls", dimensions=[4], normalize=True, temperature=0.5)

        class Dataset(torch.utils.data.Dataset):
            def __len__(self):
                return 2

            def __getitem__(self, index):
                return {"query_id": index, "document_id": index}

        def collate(rows):
            ids = [[row["query_id"]] for row in rows]
            docs = [[row["document_id"]] for row in rows]
            return {"query": batch(ids, [[1]] * len(rows)), "document": batch(docs, [[1]] * len(rows))}

        with tempfile.TemporaryDirectory() as output:
            trainer = Trainer(
                model=model,
                args=TrainingArguments(
                    output_dir=output,
                    max_steps=1,
                    per_device_train_batch_size=2,
                    report_to=[],
                    disable_tqdm=True,
                    remove_unused_columns=False,
                    dataloader_pin_memory=False,
                ),
                train_dataset=Dataset(),
                data_collator=collate,
            )
            result = trainer.train()
            self.assertEqual(result.global_step, 1)
            self.assertTrue(math.isfinite(result.training_loss))


if __name__ == "__main__":
    unittest.main()
