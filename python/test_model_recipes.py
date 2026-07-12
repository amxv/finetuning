import base64
import hashlib
import json
import os
import subprocess
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

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
except ImportError:
    Ed25519PrivateKey = None


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

    @unittest.skipIf(Ed25519PrivateKey is None, "cryptography training dependency is unavailable")
    def test_typescript_recorded_evidence_is_consumed_unchanged_for_every_recipe_and_state(self):
        repository = Path(__file__).parent.parent
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(
                ["node", str(repository / "test" / "generate-cross-runtime-qualification.mjs"), directory],
                cwd=repository,
                check=True,
                capture_output=True,
                text=True,
            )
            bundle = json.loads((Path(directory) / "bundle.json").read_text())
            with patch.dict(
                "os.environ",
                {
                    "AMXV_QUALIFICATION_TRUST_POLICY_SHA256": bundle["trustPolicySha256"],
                    "AMXV_QUALIFICATION_TRUST_POLICY_PATH": bundle["trustPolicyPath"],
                },
                clear=True,
            ):
                for item in bundle["bundles"]:
                    require_execution_gates(item["spec"])
            current = [item for item in bundle["bundles"] if item["scenario"] == "current"]
            self.assertEqual(len(current), len(RECIPES) * 3)
            self.assertEqual({item["recipeId"] for item in current}, set(RECIPES))
            self.assertEqual({item["state"] for item in current}, {"smokeAuthorized", "smokePassed", "qualified"})
            expired = [item for item in bundle["bundles"] if item["scenario"] == "expired-predecessor"]
            self.assertEqual(
                [(item["recipeId"], item["state"]) for item in expired], [("qwen3-embed-0.6b-lora", "smokePassed")]
            )

    @unittest.skipIf(Ed25519PrivateKey is None, "cryptography training dependency is unavailable")
    def test_python_execution_authorizes_full_lifecycle_with_public_verification_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store_path = root / "store.json"
            trust_policy_path = root / "trust-policy.json"
            recipe_id = "qwen3-embed-0.6b-lora"
            recipe_identity_hash = "a" * 64
            expiry = "2099-01-01T00:00:00Z"
            private_key = Ed25519PrivateKey.generate()
            public_key = (
                private_key.public_key()
                .public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo,
                )
                .decode()
            )
            trust_policy = {
                "policyVersion": "1.0.0",
                "policyId": "test-admin",
                "keys": {"reviewer": public_key},
            }
            trust_policy_path.write_text(json.dumps(trust_policy, separators=(",", ":")))
            trust_policy_sha256 = hashlib.sha256(json.dumps(trust_policy, separators=(",", ":")).encode()).hexdigest()
            architecture = {"inventorySha256": "d" * 64, "resolvedTargetModules": ["q_proj"]}
            architecture_hash = hashlib.sha256(
                json.dumps(architecture, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            binding_names = (
                "commandSha256",
                "imageDigest",
                "environmentLockSha256",
                "tokenizerSha256",
                "configSha256",
                "templateOrCodeSha256",
                "datasetSha256",
                "targetInventorySha256",
                "dependencyIdentitySha256",
            )
            bindings = {name: hashlib.sha256(name.encode()).hexdigest() for name in binding_names}
            bindings["targetInventorySha256"] = architecture["inventorySha256"]
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
            signed_gates = {
                name: gates[name]
                for name in gates
                if name
                not in ("allowModelLoad", "licenseApproved", "revisionPinned", "remoteCodeReviewed", "gpuQualified")
            }
            phases = (
                (
                    "smokeAuthorized",
                    "mechanicsSmoke",
                    "run",
                    ["LICENSE_ARTIFACT_ABSENT"],
                    {
                        "policyGatesReviewed": True,
                        "licenseAccepted": True,
                        "architectureReviewed": True,
                        "frameworkReviewed": True,
                        "datasetRightsReviewed": True,
                        "offlineExecutionNoUpload": True,
                    },
                ),
                (
                    "smokePassed",
                    "qualificationRun",
                    "evaluate",
                    ["GPU_MECHANICS_EVIDENCE_ABSENT"],
                    {
                        "forwardBackward": True,
                        "finiteLoss": True,
                        "finiteNonzeroGradients": True,
                        "checkpointResume": True,
                        "offlineReload": True,
                    },
                ),
                (
                    "qualified",
                    "experimentalUse",
                    "export",
                    [],
                    {
                        "repeatedCleanRun": True,
                        "evaluation": True,
                        "export": True,
                        "artifactManifestVerified": True,
                    },
                ),
            )
            evidence_chain = []
            evidence_ids = []
            evidence_digests = []
            previous_state = "configured"
            predecessor_digest = recipe_identity_hash
            specs = []
            for sequence, (state, operation_class, operation, blockers, assertions) in enumerate(phases, start=1):
                evidence = {
                    "evidenceVersion": "2.0.0",
                    "evidenceId": f"evidence-{sequence}",
                    "sequence": sequence,
                    "recipeId": recipe_id,
                    "recipeIdentityHash": recipe_identity_hash,
                    "architecture": RECIPES[recipe_id]["architecture"],
                    "revision": RECIPES[recipe_id]["modelRevision"],
                    "state": state,
                    "previousState": previous_state,
                    "predecessorDigest": predecessor_digest,
                    "issuedAt": "2026-07-12T00:00:00Z",
                    "expiresAt": expiry,
                    "signerKeyId": "reviewer",
                    "trustPolicySha256": trust_policy_sha256,
                    "artifactSha256": "c" * 64,
                    "bindings": bindings,
                    "assertions": assertions,
                    "authorization": {
                        "operationClass": operation_class,
                        "gates": signed_gates,
                        "dischargedBlockers": blockers,
                    },
                    "signatureBase64": "",
                }
                evidence["signatureBase64"] = base64.b64encode(
                    private_key.sign(json.dumps(evidence, separators=(",", ":")).encode())
                ).decode()
                evidence_digest = hashlib.sha256(
                    json.dumps(evidence, separators=(",", ":"), ensure_ascii=False).encode()
                ).hexdigest()
                evidence_chain.append(evidence)
                evidence_ids.append(evidence["evidenceId"])
                evidence_digests.append(evidence_digest)
                store = {
                    "storeVersion": "2.0.0",
                    "trustPolicySha256": trust_policy_sha256,
                    "recipes": {
                        recipe_id: {
                            "state": state,
                            "sequence": sequence,
                            "currentDigest": evidence_digest,
                            "evidenceIds": evidence_ids,
                            "evidenceDigests": evidence_digests,
                            "acceptedEvidence": evidence_chain,
                        }
                    },
                }
                store_path.write_text(json.dumps(store, separators=(",", ":")))
                authorization = {
                    "state": state,
                    "recipeId": recipe_id,
                    "recipeIdentityHash": recipe_identity_hash,
                    "evidenceDigest": evidence_digest,
                    "sequence": sequence,
                    "dischargedBlockers": blockers,
                    "storePath": str(store_path),
                    "storeSha256": hashlib.sha256(store_path.read_bytes()).hexdigest(),
                    "trustPolicySha256": trust_policy_sha256,
                    "expiresAt": expiry,
                    "architectureEvidenceSha256": architecture_hash,
                    "operationClass": operation_class,
                    "operation": operation,
                    "outputDirectory": str(root / "output"),
                    "artifactSha256": evidence["artifactSha256"],
                    "evidenceBindings": bindings,
                    "signerKeyId": "reviewer",
                }
                payload = {
                    key: authorization[key]
                    for key in (
                        "recipeId",
                        "recipeIdentityHash",
                        "evidenceDigest",
                        "sequence",
                        "dischargedBlockers",
                        "storeSha256",
                        "trustPolicySha256",
                        "expiresAt",
                        "architectureEvidenceSha256",
                        "operationClass",
                        "operation",
                        "outputDirectory",
                        "artifactSha256",
                        "evidenceBindings",
                    )
                }
                payload["executionGates"] = gates
                authorization["authorizationSignatureBase64"] = base64.b64encode(
                    private_key.sign(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode())
                ).decode()
                specs.append(
                    {
                        "qualificationSchemaVersion": "2.0.0",
                        "recipeId": recipe_id,
                        "operation": operation,
                        "outputDirectory": authorization["outputDirectory"],
                        "executionGates": dict(gates),
                        "qualificationAuthorization": authorization,
                        "architectureEvidence": dict(architecture),
                    }
                )
                previous_state = state
                predecessor_digest = evidence_digest
            with patch.dict(
                "os.environ",
                {
                    "AMXV_QUALIFICATION_TRUST_POLICY_SHA256": trust_policy_sha256,
                    "AMXV_QUALIFICATION_TRUST_POLICY_PATH": str(trust_policy_path),
                },
                clear=True,
            ):
                self.assertNotIn("AMXV_QUALIFICATION_AUTH_HMAC_KEY", os.environ)
                for spec in specs:
                    current_store = {
                        "storeVersion": "2.0.0",
                        "trustPolicySha256": trust_policy_sha256,
                        "recipes": {
                            recipe_id: {
                                "state": spec["qualificationAuthorization"]["state"],
                                "sequence": spec["qualificationAuthorization"]["sequence"],
                                "currentDigest": spec["qualificationAuthorization"]["evidenceDigest"],
                                "evidenceIds": evidence_ids[: spec["qualificationAuthorization"]["sequence"]],
                                "evidenceDigests": evidence_digests[: spec["qualificationAuthorization"]["sequence"]],
                                "acceptedEvidence": evidence_chain[: spec["qualificationAuthorization"]["sequence"]],
                            }
                        },
                    }
                    store_path.write_text(json.dumps(current_store, separators=(",", ":")))
                    spec["qualificationAuthorization"]["storeSha256"] = hashlib.sha256(
                        store_path.read_bytes()
                    ).hexdigest()
                    payload["storeSha256"] = spec["qualificationAuthorization"]["storeSha256"]
                    authorization = spec["qualificationAuthorization"]
                    signed_payload = {key: authorization[key] for key in payload if key != "executionGates"}
                    signed_payload["executionGates"] = spec["executionGates"]
                    authorization["authorizationSignatureBase64"] = base64.b64encode(
                        private_key.sign(json.dumps(signed_payload, sort_keys=True, separators=(",", ":")).encode())
                    ).decode()
                    require_execution_gates(spec)
                smoke_spec = specs[0]
                smoke_spec["operation"] = "evaluate"
                with self.assertRaisesRegex(RuntimeError, "OPERATION_NOT_AUTHORIZED"):
                    require_execution_gates(smoke_spec)
                smoke_spec["operation"] = "run"
                smoke_spec["executionGates"]["budgetApproved"] = False
                with self.assertRaisesRegex(RuntimeError, "PRODUCTION_GATE_CLOSED"):
                    require_execution_gates(smoke_spec)
                smoke_spec["executionGates"]["budgetApproved"] = True
                qualified_spec = specs[-1]
                qualified_spec["architectureEvidence"]["inventorySha256"] = "e" * 64
                with self.assertRaisesRegex(RuntimeError, "ARCHITECTURE_EVIDENCE_MISMATCH"):
                    require_execution_gates(qualified_spec)
                qualified_spec["architectureEvidence"] = dict(architecture)
                qualified_spec["qualificationAuthorization"]["authorizationSignatureBase64"] = base64.b64encode(
                    b"invalid-public-only-forgery"
                ).decode()
                with self.assertRaisesRegex(RuntimeError, "SIGNATURE_INVALID"):
                    require_execution_gates(qualified_spec)

    def test_all_recipe_revisions_are_exact_and_non_wave_recipes_block(self):
        evidence_document = json.loads(
            (Path(__file__).parent / "amxv_finetuning_trainer" / "recipe-evidence.json").read_text()
        )
        evidence = evidence_document["recipes"]
        lock = json.loads((Path(__file__).parent.parent / "locks" / "model-qualification-v2.json").read_text())
        blockers = json.loads((Path(__file__).parent.parent / "locks" / "qualification-blockers-v2.json").read_text())
        lock_by_id = {recipe["id"]: recipe for recipe in lock["recipes"]}
        self.assertEqual(evidence_document["blockerCatalog"], blockers["catalog"])
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
            self.assertEqual(evidence[recipe_id]["supportState"], "experimental")
            self.assertEqual(evidence[recipe_id]["qualificationState"], "configured")
            self.assertEqual(RECIPES[recipe_id]["architecture"], lock_by_id[recipe_id]["architecture"])
            self.assertEqual(evidence[recipe_id]["blockerCodes"], blockers["recipes"][recipe_id])
            self.assertEqual(
                evidence[recipe_id]["unavailableReasons"],
                [blockers["catalog"][code]["message"] for code in evidence[recipe_id]["blockerCodes"]],
            )
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
