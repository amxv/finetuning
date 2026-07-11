import unittest
from amxv_finetuning_trainer.execution_contracts import canonical_job_hash, classify_resume, parse_execution_job

H="a"*64
def job(task="chat"):
    return {"apiVersion":"finetuning.amxv.dev/job/v1","runId":"00000000-0000-7000-8000-000000000000","attemptId":"a1","attempt":1,"task":task,"recipe":{"id":"r","revision":"1","sha256":H},"model":{"id":"m","revision":"1","sha256":H},"tokenizer":{"id":"t","revision":"1","sha256":H},"image":{"reference":"x","digest":"sha256:"+H},"inputs":[],"resources":{"cpu":1},"precision":"fp32","quantization":"none","checkpoint":{},"evaluation":{},"export":{},"deadline":"2030-01-01T00:00:00Z"}
class Phase20(unittest.TestCase):
    def test_chat_embedding_and_resume(self):
        for task in ("chat","embedding"):
            value=job(task); self.assertEqual(parse_execution_job(value)["task"],task); self.assertEqual(len(canonical_job_hash(value)),64)
        self.assertEqual(classify_resume({"complete":True}),"full");self.assertEqual(classify_resume({"complete":False}),"weights_only")
    def test_fail_closed(self):
        value=job();value["unknown"]=True
        with self.assertRaisesRegex(ValueError,"UNKNOWN_FIELD"):parse_execution_job(value)
if __name__ == "__main__": unittest.main()
