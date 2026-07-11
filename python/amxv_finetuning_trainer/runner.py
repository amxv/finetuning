from __future__ import annotations
import json,sys
from pathlib import Path
from .contracts import parse_spec
from .engine import classify_checkpoint,export_artifacts,preflight,train
def main()->int:
    spec=parse_spec(json.loads(Path(sys.argv[1]).read_text()));sequence=0
    def emit(kind:str,data:dict|None=None)->None:
        nonlocal sequence;print(json.dumps({"trainingEventVersion":"1.0.0","sequence":sequence,"timestamp":"1970-01-01T00:00:00Z","runId":spec["runId"],"type":kind,**({"data":data} if data else {})}),flush=True);sequence+=1
    emit("started");operation=spec.get("operation","run")
    try:
        info=preflight(spec);emit("preflight",info)
        if operation=="prepare":result=info
        elif operation in ("run","resume"):result=train(spec,Path(spec["checkpointPath"]) if operation=="resume" and spec.get("checkpointPath") else None);emit("progress",result)
        elif operation=="status":result={"checkpointClassification":classify_checkpoint(Path(spec["checkpointPath"])) if spec.get("checkpointPath") else "none"}
        elif operation=="evaluate":result=json.loads((Path(spec["outputDirectory"])/"evaluation.json").read_text())
        else:result=export_artifacts(spec);emit("artifact",{"manifest":"artifact-manifest.json"})
        emit("completed",result);return 0
    except Exception as error:
        emit("failed",{"classification":"OOM_FALLBACK" if isinstance(error,MemoryError) else "ACTIONABLE_FAILURE","message":str(error)});return 2
if __name__=="__main__":raise SystemExit(main())
