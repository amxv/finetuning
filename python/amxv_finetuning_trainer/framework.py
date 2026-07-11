"""Dependency-backed training architecture. Imports heavy frameworks only after explicit gates."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

class FrameworkAdapter(Protocol):
    def load_tokenizer(self, model_id:str, revision:str, trust_remote_code:bool=False)->Any: ...
    def load_model(self, model_id:str, revision:str, *, quantization:str, trust_remote_code:bool=False)->Any: ...
    def prepare_chat(self, rows:list[dict[str,Any]], tokenizer:Any)->Any: ...
    def prepare_embedding(self, rows:list[dict[str,Any]], tokenizer:Any, recipe:dict[str,Any])->tuple[Any,Any]: ...
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
    def load_model(self,model_id,revision,*,quantization,trust_remote_code=False,track="chat"):
        kwargs={"revision":revision,"trust_remote_code":trust_remote_code}
        if quantization=="4bit":kwargs["quantization_config"]=self.BitsAndBytesConfig(load_in_4bit=True)
        cls=self.AutoModel if track=="embedding" else self.AutoModelForCausalLM
        return cls.from_pretrained(model_id,**kwargs)
    def prepare_chat(self,rows,tokenizer):
        prepared=[]
        for row in rows:
            rendered=tokenizer.apply_chat_template(row["messages"],tokenize=True,add_generation_prompt=False,return_assistant_tokens_mask=True,return_dict=True)
            ids=rendered["input_ids"];mask=rendered["assistant_masks"];labels=[x if m else -100 for x,m in zip(ids,mask)]
            if not any(x!=-100 for x in labels):raise ValueError("assistant-only label mask is empty")
            prepared.append({"input_ids":ids,"attention_mask":[1]*len(ids),"labels":labels})
        return self.Dataset.from_list(prepared)
    def prepare_embedding(self,rows,tokenizer,recipe):
        def encode(text):return tokenizer(text,truncation=True,max_length=recipe["maxLength"])
        prepared=[{"query":encode(recipe.get("queryPrefix","")+r["query"]),"document":encode(recipe.get("documentPrefix","")+r["document"])} for r in rows]
        def collate(batch):return {side:tokenizer.pad([x[side] for x in batch],return_tensors="pt") for side in ("query","document")}
        return self.Dataset.from_list(prepared),collate
    def attach_adapter(self,model,config):return self.get_peft_model(model,self.LoraConfig(**config))
    def train_sft(self,model,tokenizer,dataset,config):
        args=dict(config);resume=args.pop("resume_from_checkpoint",None);trainer=self.SFTTrainer(model=model,processing_class=tokenizer,train_dataset=dataset,args=self.SFTConfig(**args));trainer.train(resume_from_checkpoint=resume);return trainer
    def train_embedding(self,model,tokenizer,dataset,config):
        args=dict(config);collator=args.pop("data_collator");resume=args.pop("resume_from_checkpoint",None);trainer=self.Trainer(model=model,train_dataset=dataset,data_collator=collator,args=self.TrainingArguments(**args));trainer.train(resume_from_checkpoint=resume);return trainer
    def save(self,trainer,output,*,adapter_only):output.mkdir(parents=True,exist_ok=True);trainer.save_model(str(output));trainer.tokenizer.save_pretrained(str(output)) if getattr(trainer,"tokenizer",None) else None;return sorted(p.name for p in output.iterdir())

def require_execution_gates(spec:dict[str,Any])->None:
    gates=spec.get("executionGates",{})
    required=("allowModelLoad","licenseApproved","revisionPinned","remoteCodeReviewed","gpuQualified")
    missing=[k for k in required if gates.get(k) is not True]
    if missing:raise RuntimeError("PRODUCTION_GATE_CLOSED: "+", ".join(missing))
    if spec.get("trustRemoteCode") and not gates.get("remoteCodeReviewed"):raise RuntimeError("REMOTE_CODE_REVIEW_REQUIRED")

RECIPES={
 "qwen3.6-27b":{"track":"chat","modelId":"Qwen/Qwen3.6-27B","modelRevision":"PIN_REQUIRED","tokenizerRevision":"PIN_REQUIRED","lora":{"r":16,"lora_alpha":32,"target_modules":["q_proj","k_proj","v_proj","o_proj"]}},
 "qwen3-embedding-lora":{"track":"embedding","modelId":"Qwen/Qwen3-Embedding-0.6B","modelRevision":"PIN_REQUIRED","tokenizerRevision":"PIN_REQUIRED","pooling":"last-token","objective":"multiple-negatives","maxLength":8192,"queryPrefix":"Instruct: ","documentPrefix":"","lora":{"r":16,"lora_alpha":32,"target_modules":["q_proj","k_proj","v_proj","o_proj"]}},
 "arctic-m-v2-full":{"track":"embedding","modelId":"Snowflake/snowflake-arctic-embed-m-v2.0","modelRevision":"PIN_REQUIRED","tokenizerRevision":"PIN_REQUIRED","pooling":"masked-mean","objective":"multiple-negatives","maxLength":8192,"queryPrefix":"query: ","documentPrefix":"passage: ","lora":{}},
 "bge-m3-dense":{"track":"embedding","modelId":"BAAI/bge-m3","modelRevision":"PIN_REQUIRED_LICENSE_CONFLICT","tokenizerRevision":"PIN_REQUIRED","pooling":"cls","objective":"multiple-negatives","maxLength":8192,"queryPrefix":"","documentPrefix":"","lora":{}},
}
def resolve_recipe(recipe_id,track):
 recipe=RECIPES.get(recipe_id)
 if not recipe or recipe["track"]!=track:raise RuntimeError(f"RECIPE_DESCRIPTOR_UNAVAILABLE: {recipe_id}")
 return recipe
def execute_recipe(spec:dict[str,Any],rows:list[dict[str,Any]],framework:FrameworkAdapter,track:str)->dict[str,Any]:
    require_execution_gates(spec);recipe=resolve_recipe(spec["recipeId"],track)
    tokenizer=framework.load_tokenizer(recipe["modelId"],recipe["tokenizerRevision"],spec.get("trustRemoteCode",False))
    model=framework.load_model(recipe["modelId"],recipe["modelRevision"],quantization=spec.get("quantization","bf16"),trust_remote_code=spec.get("trustRemoteCode",False),track=track)
    if spec.get("adapter") in ("lora","qlora"):model=framework.attach_adapter(model,recipe["lora"])
    if track=="chat":data=framework.prepare_chat(rows,tokenizer);collator=None
    else:data,collator=framework.prepare_embedding(rows,tokenizer,recipe)
    config=dict(spec.get("trainingArguments",{}));config.update({"resume_from_checkpoint":spec.get("checkpointPath")}) if spec.get("checkpointPath") else None
    if collator:config["data_collator"]=collator
    trainer=framework.train_sft(model,tokenizer,data,config) if track=="chat" else framework.train_embedding(model,tokenizer,data,config)
    files=framework.save(trainer,Path(spec["outputDirectory"])/"portable",adapter_only=spec.get("adapter") in ("lora","qlora"))
    return {"track":track,"recipeId":spec["recipeId"],"portableFiles":files,"framework":"huggingface","uploads":False}
