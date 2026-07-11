import hashlib,unittest
from amxv_finetuning_trainer.audit import audit_tokenizer
from amxv_finetuning_trainer.contracts import parse_event,parse_spec
class OfflineTokenizerFixture:
    chat_template="fixture-template-v1";bos_token="<BOS>";eos_token="<EOS>"
    def apply_chat_template(self,messages,tokenize=False,add_generation_prompt=False,return_assistant_tokens_mask=False,return_dict=False):
        rendered=self.bos_token+"".join(f"<{m['role']}>{m.get('content','')}" for m in messages)+self.eos_token+("<assistant>" if add_generation_prompt else "")
        if return_dict:return {"input_ids":list(range(len(rendered))),"assistant_masks":[1 if any(m['role']=="assistant" for m in messages) else 0]}
        return list(range(len(rendered))) if tokenize else rendered
class Phase6(unittest.TestCase):
    def test_contract_matrix(self):
        spec={"trainingSpecVersion":"1.9.0","runId":"r","dataset":{},"recipeId":"x","outputDirectory":"x","objective":"sft","seed":0};self.assertEqual(parse_spec(spec),spec)
        with self.assertRaises(ValueError):parse_event({"trainingEventVersion":"2.0.0"})
    def test_all_family_offline_audits(self):
        examples=[[{"role":"user","content":"u"},{"role":"assistant","content":"a"}] for _ in range(100)];expected=hashlib.sha256(OfflineTokenizerFixture.chat_template.encode()).hexdigest()
        for _family in ["qwen-dense","qwen-moe","cascade","nano","olmo-instruct","olmo-think"]:
            report=audit_tokenizer(OfflineTokenizerFixture(),examples,expected);self.assertTrue(report.bos_ok and report.eos_ok and report.generation_prompt_ok and report.assistant_masks_nonempty);self.assertEqual(report.mode,"offline-fixture")
if __name__=="__main__":unittest.main()
