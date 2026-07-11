import tempfile,unittest
from pathlib import Path
from amxv_finetuning_trainer.engine import execute_production as chat
from amxv_finetuning_trainer.embedding_training import execute_production as embedding
class Fake:
 def __init__(self):self.calls=[]
 def load_tokenizer(self,*a,**k):self.calls.append("tokenizer");return "tok"
 def load_model(self,*a,**k):self.calls.append("model");return "model"
 def dataset(self,r):self.calls.append("dataset");return r
 def attach_adapter(self,m,c):self.calls.append("adapter");return "adapter"
 def train_sft(self,*a):self.calls.append("sft");return self
 def train_embedding(self,*a):self.calls.append("embedding");return self
 def save(self,t,o,**k):self.calls.append("save");o.mkdir(parents=True);(o/"adapter.safetensors").write_bytes(b"x");return ["adapter.safetensors"]
class Architecture(unittest.TestCase):
 def spec(self,root):return {"recipeId":"qwen3.6-27b","recipe":{"modelId":"model","modelRevision":"sha","tokenizerRevision":"sha","lora":{"r":8}},"executionGates":{"allowModelLoad":True,"licenseApproved":True,"revisionPinned":True,"remoteCodeReviewed":True,"gpuQualified":True},"adapter":"qlora","quantization":"4bit","outputDirectory":str(root),"trainingArguments":{}}
 def test_chat_and_embedding_use_framework_boundary(self):
  with tempfile.TemporaryDirectory() as d:
   f=Fake();self.assertEqual(chat(self.spec(Path(d)/"c"),[{"messages":[]}],f)["uploads"],False);self.assertEqual(f.calls,["tokenizer","model","adapter","dataset","sft","save"])
   f=Fake();embedding(self.spec(Path(d)/"e"),[{"query":"q","document":"d"}],f);self.assertIn("embedding",f.calls)
 def test_gate_closes_before_framework(self):
  with tempfile.TemporaryDirectory() as d:
   s=self.spec(Path(d));s["executionGates"]["licenseApproved"]=False;f=Fake();self.assertRaisesRegex(RuntimeError,"PRODUCTION_GATE_CLOSED",chat,s,[],f);self.assertEqual(f.calls,[])
