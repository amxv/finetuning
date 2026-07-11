from __future__ import annotations
import json,signal,sys,time
def main()->int:
    mode=sys.argv[1] if len(sys.argv)>1 else "malformed"
    if mode.endswith("malformed.json"):
        print("not-json",flush=True);time.sleep(.2);return 0
    stopped=False
    def stop(_signal:int,_frame:object)->None:
        nonlocal stopped;stopped=True
    signal.signal(signal.SIGTERM,stop)
    print(json.dumps({"trainingEventVersion":"1.0.0","sequence":0,"timestamp":"1970-01-01T00:00:00Z","runId":"cancel","type":"started"}),flush=True)
    while not stopped: time.sleep(.01)
    print(json.dumps({"trainingEventVersion":"1.0.0","sequence":1,"timestamp":"1970-01-01T00:00:00Z","runId":"cancel","type":"failed","data":{"reason":"cancelled"}}),flush=True);return 130
if __name__=="__main__":raise SystemExit(main())
