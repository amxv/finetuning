"""Dependency-backed training architecture. Imports heavy frameworks only after explicit gates."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

class FrameworkAdapter(Protocol):
    def load_tokenizer(self, model_id:str, revision:str, trust_remote_code:bool=False)->Any: ...
    def load_model(self, model_id:str, revision:str, *, quantization:str, trust_remote_code:bool=False)->Any: ...
    def dataset(self, rows:list[dict[str,Any]])->Any: ...
    def attach_adapter(self, model:Any, config:dict[str,Any])->Any: ...
    def train_sft(self, model:Any, tokenizer:Any, dataset:Any, config:dict[str,Any])->Any: ...
    def train_embedding(self, model:Any, tokenizer:Any, dataset:Any, config:dict[str,Any])->Any: ...
    def save(self, trainer:Any, output:Path, *, adapter_only:bool)->list[str]: ...

class HuggingFaceFramework:
    """Real Transformers/Datasets/TRL/PEFT wiring; never imported or invoked implicitly."""
    def __init__(self):
        try:
            from transformers import AutoModel,AutoModelForCausalLM,AutoTokenizer,BitsAndBytesConfig,TrainingArguments
            from datasets import Dataset
            from peft import LoraConfig,get_peft_model
            from trl import SFTConfig,SFTTrainer
            from transformers import Trainer
        except ImportError as e: raise RuntimeError("TRAINING_DEPENDENCY_MISSING: install amxv-finetuning-trainer[training]") from e
        self.AutoModel,self.AutoModelForCausalLM,self.AutoTokenizer=AutoModel,AutoModelForCausalLM,AutoTokenizer
        self.BitsAndBytesConfig,self.TrainingArguments=BitsAndBytesConfig,TrainingArguments
        self.Dataset,self.LoraConfig,self.get_peft_model=Dataset,LoraConfig,get_peft_model
        self.SFTConfig,self.SFTTrainer,self.Trainer=SFTConfig,SFTTrainer,Trainer
    def load_tokenizer(self,model_id,revision,trust_remote_code=False):return self.AutoTokenizer.from_pretrained(model_id,revision=revision,trust_remote_code=trust_remote_code)
    def load_model(self,model_id,revision,*,quantization,trust_remote_code=False):
        kwargs={"revision":revision,"trust_remote_code":trust_remote_code}
        if quantization=="4bit":kwargs["quantization_config"]=self.BitsAndBytesConfig(load_in_4bit=True)
        cls=self.AutoModel if "embedding" in model_id.lower() else self.AutoModelForCausalLM
        return cls.from_pretrained(model_id,**kwargs)
    def dataset(self,rows):return self.Dataset.from_list(rows)
    def attach_adapter(self,model,config):return self.get_peft_model(model,self.LoraConfig(**config))
    def train_sft(self,model,tokenizer,dataset,config):
        trainer=self.SFTTrainer(model=model,processing_class=tokenizer,train_dataset=dataset,args=self.SFTConfig(**config));trainer.train(resume_from_checkpoint=config.get("resume_from_checkpoint"));return trainer
    def train_embedding(self,model,tokenizer,dataset,config):
        collator=config.pop("data_collator");trainer=self.Trainer(model=model,train_dataset=dataset,data_collator=collator,args=self.TrainingArguments(**config));trainer.train(resume_from_checkpoint=config.get("resume_from_checkpoint"));return trainer
    def save(self,trainer,output,*,adapter_only):output.mkdir(parents=True,exist_ok=True);trainer.save_model(str(output));trainer.tokenizer.save_pretrained(str(output)) if getattr(trainer,"tokenizer",None) else None;return sorted(p.name for p in output.iterdir())

def require_execution_gates(spec:dict[str,Any])->None:
    gates=spec.get("executionGates",{})
    required=("allowModelLoad","licenseApproved","revisionPinned","remoteCodeReviewed","gpuQualified")
    missing=[k for k in required if gates.get(k) is not True]
    if missing:raise RuntimeError("PRODUCTION_GATE_CLOSED: "+", ".join(missing))
    if spec.get("trustRemoteCode") and not gates.get("remoteCodeReviewed"):raise RuntimeError("REMOTE_CODE_REVIEW_REQUIRED")

def execute_recipe(spec:dict[str,Any],rows:list[dict[str,Any]],framework:FrameworkAdapter,track:str)->dict[str,Any]:
    require_execution_gates(spec);recipe=spec["recipe"]
    tokenizer=framework.load_tokenizer(recipe["modelId"],recipe["tokenizerRevision"],spec.get("trustRemoteCode",False))
    model=framework.load_model(recipe["modelId"],recipe["modelRevision"],quantization=spec.get("quantization","bf16"),trust_remote_code=spec.get("trustRemoteCode",False))
    if spec.get("adapter") in ("lora","qlora"):model=framework.attach_adapter(model,recipe["lora"])
    data=framework.dataset(rows);config=dict(spec.get("trainingArguments",{}))
    trainer=framework.train_sft(model,tokenizer,data,config) if track=="chat" else framework.train_embedding(model,tokenizer,data,config)
    files=framework.save(trainer,Path(spec["outputDirectory"])/"portable",adapter_only=spec.get("adapter") in ("lora","qlora"))
    return {"track":track,"recipeId":spec["recipeId"],"portableFiles":files,"framework":"huggingface","uploads":False}
