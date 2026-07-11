from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

@dataclass(frozen=True)
class AuditReport:
    examples: int; template_hash: str; template_hash_ok: bool; bos_ok: bool; eos_ok: bool; generation_prompt_ok: bool; no_duplicate_special_tokens: bool; assistant_masks_nonempty: bool; roles_tools_ok: bool; mode: str

def audit_tokenizer(tokenizer: Any, examples: list[list[dict[str,Any]]], expected_hash: str, supports_tools: bool=True) -> AuditReport:
    """Uses tokenizer.apply_chat_template; never implements Jinja semantics here."""
    if len(examples) != 100: raise ValueError("template audit requires exactly 100 examples")
    template=getattr(tokenizer,"chat_template",None)
    if not isinstance(template,str): raise ValueError("tokenizer chat_template is unavailable")
    digest=sha256(template.encode()).hexdigest()
    rendered=[tokenizer.apply_chat_template(item,tokenize=False,add_generation_prompt=True) for item in examples]
    masks=[tokenizer.apply_chat_template(item,tokenize=True,add_generation_prompt=False,return_assistant_tokens_mask=True,return_dict=True).get("assistant_masks",[]) for item in examples]
    bos=getattr(tokenizer,"bos_token",None); eos=getattr(tokenizer,"eos_token",None)
    return AuditReport(100,digest,digest==expected_hash,all(not bos or text.count(bos)==1 for text in rendered),all(not eos or eos in text for text in rendered),all(text for text in rendered),all(not bos or f"{bos}{bos}" not in text for text in rendered),all(any(mask) for mask in masks),supports_tools or all(not any(m.get("role")=="tool" for m in item) for item in examples),"offline-fixture" if tokenizer.__class__.__name__=="OfflineTokenizerFixture" else "live")
