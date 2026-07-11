from __future__ import annotations
import hashlib,json,math,os,platform,random,signal,sys,tempfile
from pathlib import Path
SPEC_VERSION="embedding.training.v1";EVENT_VERSION="embedding.training.event.v1";ARTIFACT_VERSION="embedding.training.artifact.v1"
FULL=("model","optimizer","scheduler","scaler","rng","sampler","globalStep","identityHash")
def canonical(value):return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)
def digest(value):return hashlib.sha256((value if isinstance(value,bytes) else canonical(value).encode())).hexdigest()
def parse_spec(v):
 if not isinstance(v,dict) or not isinstance(v.get("embeddingTrainingSpecVersion"),str):raise ValueError("EMBED_SPEC_INVALID: missing embeddingTrainingSpecVersion")
 if v["embeddingTrainingSpecVersion"].split(".v")[-1]!=SPEC_VERSION.split(".v")[-1]:raise ValueError(f"EMBED_SPEC_VERSION: expected {SPEC_VERSION}")
 for k in ("runId","datasetManifest","recipeId","objective","outputDirectory","effectiveBatchSize","immutableIdentity"):
  if k not in v:raise ValueError(f"EMBED_SPEC_INVALID: missing $.{k}")
 if v["recipeId"]!="cpu-tiny-embedding-fixture":raise ValueError(f"EMBED_RECIPE_UNAVAILABLE: {v['recipeId']} lacks model-specific smoke/reload/export evidence")
 if v["effectiveBatchSize"]<2:raise ValueError("EMBED_EFFECTIVE_BATCH: use effectiveBatchSize >= 2 for in-batch negatives")
 required=("modelRevision","tokenizerRevision","configRevision","dataHash","splitHash","taskMapping","prompts","pooling","padding","normalization","dimensions","objective","seed")
 for k in required:
  if k not in v["immutableIdentity"]:raise ValueError(f"EMBED_RESUME_IDENTITY: missing $.immutableIdentity.{k}")
 if "seed" in v and (not isinstance(v["seed"],int) or v["seed"]!=v["immutableIdentity"]["seed"]):raise ValueError("EMBED_RESUME_IDENTITY: $.seed must equal $.immutableIdentity.seed")
 return v
def losses(kind,pred,target):
 if len(pred)!=len(target):raise ValueError("EMBED_LOSS_SHAPE: prediction/target length mismatch")
 if kind in ("cosine","mse","margin-mse"):return sum((a-b)**2 for a,b in zip(pred,target))/len(pred)
 if kind in ("contrastive","multiple-negatives","info-nce","cached-info-nce"):return -sum(t*math.log(max(1e-12,p)) for p,t in zip(pred,target))/len(pred)
 if kind in ("cosent","triplet","pairwise-kl","listwise-kl"):return sum(abs(a-b) for a,b in zip(pred,target))/len(pred)
 raise ValueError(f"EMBED_LOSS_UNSUPPORTED: {kind}")
def checkpoint_classification(path,identity_hash):
 if not path or not path.exists():return "none"
 state=json.loads(path.read_text());return "full-resume" if all(k in state for k in FULL) and state["identityHash"]==identity_hash else "weights-only-warm-start"
def atomic(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);fd,name=tempfile.mkstemp(dir=path.parent,prefix=".tmp-")
 try:
  with os.fdopen(fd,"w") as f:f.write(json.dumps(value,sort_keys=True)+"\n");f.flush();os.fsync(f.fileno())
  os.replace(name,path)
 finally:
  if os.path.exists(name):os.unlink(name)
def records(spec):
 root=Path(spec["datasetManifest"]).parent;path=root/"records.jsonl";rows=[]
 for line in path.read_text().splitlines():
  if not line.strip():continue
  row=json.loads(line);texts=[]
  def walk(v):
   if isinstance(v,dict):
    if isinstance(v.get("text"),str):texts.append(v["text"])
    for x in v.values():walk(x)
   elif isinstance(v,list):
    for x in v:walk(x)
  walk(row);h=int(hashlib.sha256("\n".join(texts).encode()).hexdigest()[:8],16);rows.append(((h%1000)/1000,max(.01,min(1,len("".join(texts))/100))))
 if not rows:raise ValueError("EMBED_DATA_SHAPE: dataset has no text records")
 return rows
def train(spec,resume=None):
 spec=parse_spec(spec);out=Path(spec["outputDirectory"]);out.mkdir(parents=True,exist_ok=True);identity_hash=digest(spec["immutableIdentity"]);data=records(spec);rng=random.Random(spec["immutableIdentity"]["seed"]);weight=rng.random();step=0;optimizer={"momentum":0.0};scheduler={"rate":.08};classification=checkpoint_classification(resume,identity_hash)
 if resume:
  state=json.loads(resume.read_text());weight=state["model"]["weight"]
  if classification=="full-resume":step=state["globalStep"];optimizer=state["optimizer"];scheduler=state["scheduler"];rng.setstate(_tuple(state["rng"]))
 for i in range(step,len(data)*4):
  x,y=data[i%len(data)];gradient=2*(weight*x-y)*x;optimizer["momentum"]=.9*optimizer["momentum"]+.1*gradient;weight-=scheduler["rate"]*optimizer["momentum"];step=i+1
  atomic(out/f"checkpoint-{step}.json",{"model":{"weight":weight},"optimizer":optimizer,"scheduler":scheduler,"scaler":{"scale":1},"rng":list(rng.getstate()),"sampler":{"position":i%len(data)},"globalStep":step,"identityHash":identity_hash})
 manifests={"resolved-spec.json":spec,"environment.json":{"python":platform.python_version(),"platform":platform.platform(),"secrets":[]},"packages.json":{"dependencies":"stdlib-only"},"gpu.json":{"available":False,"device":"cpu"},"evaluation.json":{"mse":sum((weight*x-y)**2 for x,y in data)/len(data)},"export-config.json":{"pooling":spec["immutableIdentity"]["pooling"],"padding":spec["immutableIdentity"]["padding"],"normalization":spec["immutableIdentity"]["normalization"],"dimensions":spec["immutableIdentity"]["dimensions"]},"model.json":{"weight":weight},"model-card.json":{"fixture":True,"licenseRefs":[]}}
 for name,value in manifests.items():atomic(out/name,value)
 return {"globalStep":step,"weight":weight,"resumeClassification":classification,"identityHash":identity_hash}
def export(spec):
 out=Path(spec["outputDirectory"]);items=[]
 for path in sorted(out.iterdir()):
  if path.is_file() and path.name!="embedding-artifact-manifest.json":items.append({"path":path.name,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"bytes":path.stat().st_size,"kind":path.suffix[1:] or "file"})
 manifest={"embeddingArtifactVersion":ARTIFACT_VERSION,"runId":spec["runId"],"specHash":digest(spec),"artifacts":items};atomic(out/"embedding-artifact-manifest.json",manifest);return manifest
def verify(path):
 m=json.loads(path.read_text())
 if m.get("embeddingArtifactVersion")!=ARTIFACT_VERSION:raise ValueError("EMBED_ARTIFACT_VERSION")
 root=path.parent.resolve();seen=set()
 for x in m["artifacts"]:
  rel=Path(x["path"])
  if rel.is_absolute() or ".." in rel.parts or x["path"] in seen:raise ValueError(f"EMBED_ARTIFACT_PATH: {x['path']}")
  seen.add(x["path"]);p=path.parent/rel
  if p.is_symlink():raise ValueError(f"EMBED_ARTIFACT_SYMLINK: {x['path']}")
  try:resolved=p.resolve(strict=True)
  except FileNotFoundError:raise ValueError(f"EMBED_ARTIFACT_MISSING: {x['path']}")
  if root not in resolved.parents or not resolved.is_file():raise ValueError(f"EMBED_ARTIFACT_PATH: {x['path']}")
  if resolved.stat().st_size!=x["bytes"] or hashlib.sha256(resolved.read_bytes()).hexdigest()!=x["sha256"]:raise ValueError(f"EMBED_ARTIFACT_TAMPER: {x['path']}")
 return m
def _tuple(v):return tuple(_tuple(x) for x in v) if isinstance(v,list) else v
def main():
 spec=parse_spec(json.loads(Path(sys.argv[1]).read_text()));seq=0
 def emit(kind,data=None):
  nonlocal seq;print(json.dumps({"embeddingTrainingEventVersion":EVENT_VERSION,"sequence":seq,"timestamp":"1970-01-01T00:00:00Z","runId":spec["runId"],"type":kind,**({"data":data} if data is not None else {})}),flush=True);seq+=1
 emit("started");op=spec.get("operation","run")
 try:
  emit("preflight",{"recipe":spec["recipeId"],"device":"cpu","estimatedPeakBytes":1048576,"network":False})
  if op in ("run","resume"):result=train(spec,Path(spec["checkpointPath"]) if op=="resume" and spec.get("checkpointPath") else None);emit("progress",result)
  elif op=="status":result={"checkpointClassification":checkpoint_classification(Path(spec["checkpointPath"]),digest(spec["immutableIdentity"])) if spec.get("checkpointPath") else "none"}
  elif op=="export":result=export(spec);emit("artifact",{"manifest":"embedding-artifact-manifest.json"})
  elif op=="inspect":result=verify(Path(spec["artifactPath"]))
  else:result={"validated":True,"estimatedPeakBytes":1048576}
  emit("completed",result);return 0
 except Exception as e:emit("failed",{"code":"EMBED_OOM" if isinstance(e,MemoryError) else "EMBED_TRAINING_FAILED","message":str(e),"remediation":"Reduce sequence length/batch/dimension or use accumulation; verify checkpoint completeness."});return 2
if __name__=="__main__":raise SystemExit(main())
