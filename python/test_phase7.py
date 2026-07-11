from __future__ import annotations
import json,tempfile,unittest
from pathlib import Path
from amxv_finetuning_trainer.engine import classify_checkpoint,discover_lora_targets,export_artifacts,preflight,reload_parity,render_and_mask,sft_collate,train,verify_artifacts
class Tokenizer:
    def apply_chat_template(self,messages,**kwargs):return {"input_ids":[1,2,3],"assistant_masks":[0,1,1]}
class Phase7(unittest.TestCase):
    def fixture(self,root:Path,name:str)->dict:
        frozen=root/"frozen";frozen.mkdir(exist_ok=True);(frozen/"records.jsonl").write_text(json.dumps({"messages":[{"role":"user","content":[{"type":"text","text":"hello"}]},{"role":"assistant","content":[{"type":"text","text":"answer"}]}]})+"\n");(frozen/"manifest.json").write_text("{}")
        return {"trainingSpecVersion":"1.0.0","runId":name,"dataset":{"manifestPath":str(frozen/"manifest.json"),"recordsHash":"a"*64},"recipeId":"cpu-tiny-fixture","outputDirectory":str(root/name),"objective":"sft","seed":7,"quantization":"bf16"}
    def test_cpu_train_resume_evaluate_export_reload_and_tamper(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);full=train(self.fixture(root,"full"));resume_spec=self.fixture(root,"resumed");resumed=train(resume_spec,root/"full"/"checkpoint-1.json");self.assertAlmostEqual(full["metric"],resumed["metric"],places=12);self.assertEqual(resumed["resumeClassification"],"full-resume");self.assertTrue(reload_parity(root/"resumed"/"adapter.json",.5));manifest=export_artifacts(resume_spec);self.assertEqual(verify_artifacts(root/"resumed"/"artifact-manifest.json"),manifest);(root/"resumed"/"adapter.json").write_text("tampered");self.assertRaises(ValueError,verify_artifacts,root/"resumed"/"artifact-manifest.json")
    def test_masks_collator_targets_and_checkpoint_classification(self):
        ids,labels=render_and_mask([{"role":"assistant","content":"x"}],Tokenizer());self.assertEqual(labels,[-100,2,3]);self.assertEqual(sft_collate([(ids,labels),([1],[-100])])["attention_mask"],[[1,1,1],[1,0,0]]);self.assertEqual(discover_lora_targets(["x.q_proj","x.norm"]),["x.q_proj"])
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"warm.json";path.write_text(json.dumps({"model":{"weight":1}}));self.assertEqual(classify_checkpoint(path),"weights-only-warm-start")
    def test_production_and_hardware_preflight_are_actionable(self):
        with tempfile.TemporaryDirectory() as d:
            spec=self.fixture(Path(d),"x");spec["recipeId"]="qwen3.6-27b";self.assertRaisesRegex(RuntimeError,"UNRESOLVED_RECIPE",preflight,spec)
if __name__=="__main__":unittest.main()
