import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalSerialize, canonicalSha256, type DatasetSplitV1 } from "../core/canonical.js";
import { atomicWrite } from "../node/storage.js";
import { parseJsonl, serializeJsonl, type JsonlRecord } from "../formats/streaming.js";
import { validateEmbeddingRecord, type EmbeddingDatasetManifestV1, type EmbeddingRecordV1 } from "../experimental/embeddings-phase11.js";
import { decodeEmbeddingRow, encodeEmbeddingRow, type EmbeddingCodecOptions, type EmbeddingFormat, type EmbeddingLoss } from "./formats.js";

export interface EmbeddingValidationIssue { code: string; severity: "error"|"warning"; recordId?: string; path: string; message: string; line?: number; source?: string }
export interface EmbeddingValidationReport { valid: boolean; issues: EmbeddingValidationIssue[]; recordCount: number; dimensions: number[] }
export async function* importEmbeddingJsonl(chunks: AsyncIterable<string|Uint8Array>, options: EmbeddingCodecOptions = {}, source?: string): AsyncGenerator<{record:EmbeddingRecordV1; location:JsonlRecord<unknown>; losses:EmbeddingLoss[]}> {
  for await (const location of parseJsonl<Record<string,unknown>>(chunks)) {
    const result=decodeEmbeddingRow(location.value,options); if (!result.supported || !result.value) { const e=new Error(result.losses.map(x=>x.message).join("; ")); Object.assign(e,{line:location.line,byteOffset:location.byteOffset,source}); throw e; }
    yield {record:result.value,location,losses:result.losses};
  }
}
export async function* exportEmbeddingJsonl(records: AsyncIterable<EmbeddingRecordV1>, format:EmbeddingFormat="canonical-embedding-jsonl", mapping?:EmbeddingCodecOptions["mapping"]):AsyncGenerator<string>{
  async function* rows(){for await(const r of records){const x=encodeEmbeddingRow(r,format,mapping);if(!x.supported||!x.value)throw new Error(x.losses.map(l=>l.message).join("; "));yield x.value;}} yield* serializeJsonl(rows(),v=>canonicalSerialize(v as never));
}
export async function validateEmbeddingRecords(records:AsyncIterable<EmbeddingRecordV1>):Promise<EmbeddingValidationReport>{
 const issues:EmbeddingValidationIssue[]=[], ids=new Set<string>(), textIds=new Map<string,string>(), dims=new Set<number>();let n=0;
 for await(const r of records){n++;try{validateEmbeddingRecord(r);}catch(e){issues.push({code:e instanceof Error?e.message:"EMBED_INVALID",severity:"error",recordId:r.id,path:"$",message:e instanceof Error?e.message:String(e)});}
  if(ids.has(r.id))issues.push({code:"EMBED_DUPLICATE_ID",severity:"error",recordId:r.id,path:"$.id",message:"record IDs must be globally unique"});ids.add(r.id);
  for(const t of texts(r)){const prior=textIds.get(t.id);if(prior&&prior!==t.textHash)issues.push({code:"EMBED_GLOBAL_TEXT_ID_CONFLICT",severity:"error",recordId:r.id,path:"$",message:`text ID ${t.id} identifies different content`});textIds.set(t.id,t.textHash);}
  if(r.kind==="retrieval-set"){const p=new Set(r.positives.map(x=>x.id));for(const x of r.negatives)if(p.has(x.id))issues.push({code:"EMBED_POSITIVE_NEGATIVE_CONFLICT",severity:"error",recordId:r.id,path:"$.negatives",message:`${x.id} is both positive and negative`});}
  if(r.kind==="triplet"&&r.positive.textHash===r.negative.textHash)issues.push({code:"EMBED_FALSE_NEGATIVE",severity:"warning",recordId:r.id,path:"$.negative",message:"negative text is identical to positive text"});
  if(r.kind==="teacher-vector"){const d=r.vector.storage==="inline"?r.vector.dimension:r.vector.ref.dimension;dims.add(d);}
 }
 if(dims.size>1)issues.push({code:"EMBED_VECTOR_DIMENSION_INCONSISTENT",severity:"error",path:"$",message:`mixed dimensions: ${[...dims].sort((a,b)=>a-b).join(", ")}`});
 return{valid:!issues.some(x=>x.severity==="error"),issues,recordCount:n,dimensions:[...dims].sort((a,b)=>a-b)};
}
export function splitEmbeddingRecords(records:EmbeddingRecordV1[],salt:string,ratios={train:.8,validation:.1,test:.1}):EmbeddingRecordV1[]{
 if(Math.abs(ratios.train+ratios.validation+ratios.test-1)>1e-9)throw new Error("EMBED_SPLIT_RATIOS");
 const parent=new Map<string,string>();const find=(x:string):string=>{const p=parent.get(x);if(!p){parent.set(x,x);return x}if(p===x)return x;const root=find(p);parent.set(x,root);return root};const union=(a:string,b:string)=>{a=find(a);b=find(b);if(a!==b)parent.set(a<b?b:a,a<b?a:b)};
 for(const r of records){const meta=(r.metadata??{}) as Record<string,unknown>;const keys=[r.splitGroup,r.parentGroup,r.translationGroup,r.syntheticGroup,r.source.sourceId,typeof meta.timeGroup==="string"?meta.timeGroup:undefined,...texts(r).flatMap(t=>[t.documentId,t.entityId,t.corpusId])].filter((x):x is string=>!!x);keys.forEach(k=>union(keys[0]!,k));}
 const choose=(g:string):DatasetSplitV1=>{const u=parseInt(canonicalSha256(`${salt}\0${find(g)}`).slice(0,13),16)/0x1fffffffffffff;return u<ratios.train?"train":u<ratios.train+ratios.validation?"validation":"test"};
 return records.map(r=>({...r,split:choose(r.splitGroup)}));
}
export interface DedupeMembership{recordId:string;clusterId:string;representative:boolean;rationale:string;methods:("exact"|"normalized"|"minhash"|"semantic")[]}
export interface SemanticDedupePlugin{id:string;lockHash:string;threshold:number;similarity(a:string,b:string):Promise<number>}
export async function dedupeEmbeddingRecords(records:EmbeddingRecordV1[],opts:{minhashThreshold?:number;semantic?:SemanticDedupePlugin}={}):Promise<DedupeMembership[]>{
 const clusters:EmbeddingRecordV1[][]=[];for(const r of [...records].sort((a,b)=>a.id.localeCompare(b.id))){const value=texts(r).map(x=>x.text).join("\n"), norm=normalize(value);let target:EmbeddingRecordV1[]|undefined,methods:DedupeMembership["methods"]=[];
  for(const c of clusters){const cv=texts(c[0]!).map(x=>x.text).join("\n"),cn=normalize(cv);if(value===cv){target=c;methods=["exact"];break}if(norm===cn){target=c;methods=["normalized"];break}if(jaccard(shingles(norm),shingles(cn))>=(opts.minhashThreshold??.85)){target=c;methods=["minhash"];break}if(opts.semantic&&await opts.semantic.similarity(value,cv)>=opts.semantic.threshold){if(!opts.semantic.lockHash)throw new Error("EMBED_SEMANTIC_LOCK_REQUIRED");target=c;methods=["semantic"];break}}
  (target??(clusters.push([]),clusters.at(-1)!)).push(r);(r as any).__methods=methods;}
 return clusters.flatMap(c=>c.map((r,i)=>({recordId:r.id,clusterId:`cluster-${canonicalSha256(c.map(x=>x.id).sort() as never).slice(0,16)}`,representative:i===0,rationale:i===0?"lowest deterministic record ID":"duplicate of deterministic representative",methods:(r as any).__methods??[]})));
}
export interface ContaminationEvidence{version:"1.0.0";thresholds:{nearText:number};comparisons:Array<{trainId:string;heldoutId:string;kind:"exact"|"normalized"|"near"|"benchmark";score:number}>;benchmarkExcludedIds:string[];hash:string}
export function scanEmbeddingContamination(train:EmbeddingRecordV1[],heldout:EmbeddingRecordV1[],benchmarks:EmbeddingRecordV1[]=[],nearText=.85):ContaminationEvidence{
 const comparisons:ContaminationEvidence["comparisons"]=[], scan=(b:EmbeddingRecordV1,kind:"benchmark"|undefined)=>{for(const a of train)for(const x of texts(a))for(const y of texts(b)){const score=jaccard(shingles(normalize(x.text)),shingles(normalize(y.text)));if(x.text===y.text)comparisons.push({trainId:a.id,heldoutId:b.id,kind:kind??"exact",score:1});else if(normalize(x.text)===normalize(y.text))comparisons.push({trainId:a.id,heldoutId:b.id,kind:kind??"normalized",score:1});else if(score>=nearText)comparisons.push({trainId:a.id,heldoutId:b.id,kind:kind??"near",score});}};
 heldout.forEach(x=>scan(x,undefined));benchmarks.forEach(x=>scan(x,"benchmark"));const value={version:"1.0.0" as const,thresholds:{nearText},comparisons,benchmarkExcludedIds:benchmarks.map(x=>x.id).sort()};return{...value,hash:canonicalSha256(value as never)};
}
export async function freezeEmbeddingDataset(directory:string,records:EmbeddingRecordV1[],evidence:ContaminationEvidence,memberships:DedupeMembership[],createdAt="1970-01-01T00:00:00.000Z"):Promise<EmbeddingDatasetManifestV1>{
 const report=await validateEmbeddingRecords(iter(records));if(!report.valid)throw new Error(`EMBED_FREEZE_VALIDATION:${report.issues.map(x=>x.code).join(",")}`);if(!records.length||records.some(r=>!r.splitGroup||!r.source.rights||!r.source.license||!r.source.revision))throw new Error("EMBED_FREEZE_EVIDENCE_INCOMPLETE");if(canonicalSha256(({version:evidence.version,thresholds:evidence.thresholds,comparisons:evidence.comparisons,benchmarkExcludedIds:evidence.benchmarkExcludedIds}) as never)!==evidence.hash)throw new Error("EMBED_CONTAMINATION_TAMPERED");
 const byId=new Map(memberships.map(x=>[x.recordId,x]));if(records.some(x=>!byId.has(x.id)))throw new Error("EMBED_DEDUPE_EVIDENCE_INCOMPLETE");const clusters=new Map<string,Set<DatasetSplitV1>>();for(const r of records){const c=byId.get(r.id)!.clusterId;const s=clusters.get(c)??new Set();s.add(r.split);clusters.set(c,s)}if([...clusters.values()].some(x=>x.size>1))throw new Error("EMBED_DEDUPE_CROSS_SPLIT");
 const jsonl=records.map(r=>canonicalSerialize(r as never)).join("\n")+"\n",recordsHash=canonicalSha256(jsonl);const manifest:EmbeddingDatasetManifestV1={embeddingDatasetManifestVersion:"1.0.0",id:`embedding-${recordsHash.slice(0,16)}`,recordsHash,recordCount:records.length,recordKinds:[...new Set(records.map(x=>x.kind))].sort(),splitGroups:[...new Set(records.map(x=>x.splitGroup))].sort(),sourceRevisions:[...new Set(records.map(x=>x.source.revision))].sort(),vectorShards:[],contaminationScanHash:evidence.hash,createdAt};await mkdir(directory,{recursive:true});await atomicWrite(join(directory,"records.jsonl"),jsonl);await atomicWrite(join(directory,"contamination.json"),canonicalSerialize(evidence as never)+"\n");await atomicWrite(join(directory,"dedupe.json"),canonicalSerialize(memberships as never)+"\n");await atomicWrite(join(directory,"manifest.json"),canonicalSerialize(manifest as never)+"\n");return manifest;
}
export async function verifyFrozenEmbeddingDataset(directory:string):Promise<EmbeddingDatasetManifestV1>{const m=JSON.parse(await readFile(join(directory,"manifest.json"),"utf8")) as EmbeddingDatasetManifestV1,r=await readFile(join(directory,"records.jsonl"),"utf8"),e=JSON.parse(await readFile(join(directory,"contamination.json"),"utf8")) as ContaminationEvidence;if(canonicalSha256(r)!==m.recordsHash||e.hash!==m.contaminationScanHash)throw new Error("EMBED_FROZEN_TAMPERED");return m;}
export async function readBoundedVectorShard(chunks:AsyncIterable<Uint8Array>,options:{expectedBytes:number;maxBytes:number}):Promise<Uint8Array>{if(options.expectedBytes>options.maxBytes)throw new Error("EMBED_VECTOR_SHARD_BOUNDS");const out=new Uint8Array(options.expectedBytes);let offset=0;for await(const chunk of chunks){if(offset+chunk.byteLength>options.expectedBytes)throw new Error("EMBED_VECTOR_SHARD_SHAPE");out.set(chunk,offset);offset+=chunk.byteLength;}if(offset!==options.expectedBytes)throw new Error("EMBED_VECTOR_SHARD_SHAPE");return out;}
function texts(v:unknown,out:{id:string;text:string;textHash:string;documentId?:string;entityId?:string;corpusId?:string}[]=[]):typeof out{if(!v||typeof v!=="object")return out;if("text" in v&&"textHash" in v&&typeof v.text==="string")out.push(v as any);for(const x of Array.isArray(v)?v:Object.values(v))texts(x,out);return out}function normalize(s:string){return s.normalize("NFKC").toLocaleLowerCase("und").replace(/\s+/g," ").trim()}function shingles(s:string){const a=s.split(" "),v=new Set<string>();for(let i=0;i<a.length;i++)v.add(a.slice(i,i+3).join(" "));return v}function jaccard(a:Set<string>,b:Set<string>){let n=0;for(const x of a)if(b.has(x))n++;return n/(a.size+b.size-n||1)}async function* iter<T>(a:T[]){yield*a}
