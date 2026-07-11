import { ReliableTeacherProvider } from "../providers/reliable.js";
import { openAIProviderAdapter } from "../providers/openai.js";
import { anthropicProviderAdapter } from "../providers/anthropic.js";
import type { DistillationConfig, DistillationProvider } from "../distillation/index.js";
import type { ModelClient, ModelProviderKind } from "../providers/index.js";
import type { TeacherTransport } from "../providers/contracts.js";

export interface ProviderCliGates { network:boolean; generationCredentialEnv:string; judgingCredentialEnv:string; generationBudget:number; judgingBudget:number; generationInputPerMillion:number;generationOutputPerMillion:number;judgingInputPerMillion:number;judgingOutputPerMillion:number;generationSpent?:number;judgingSpent?:number }
export type ClientFactory=(provider:"openai"|"anthropic",apiKey:string,model:string)=>ModelClient;
const defaultFactory:ClientFactory=(provider,key,model)=>(provider==="openai"?openAIProviderAdapter:anthropicProviderAdapter).createClient({apiKey:key,model});
export function providerDistillation(config:DistillationConfig,gates:ProviderCliGates,env:NodeJS.ProcessEnv=process.env,factory:ClientFactory=defaultFactory):{generator:DistillationProvider;judge:DistillationProvider}{
  if(!gates.network)throw new Error("DISTILL_NETWORK_OPT_IN_REQUIRED: pass --allow-network");
  if(!(gates.generationBudget>0)&&!(gates.judgingBudget>0))throw new Error("DISTILL_BUDGET_REQUIRED: set separate positive generation and judging budgets");
  if(!(gates.generationBudget>0)||!(gates.judgingBudget>0))throw new Error("DISTILL_BUDGET_REQUIRED: generation and judging budgets must both be positive");
  if(!config.judge)throw new Error("DISTILL_JUDGE_REQUIRED: provider-backed execution requires an explicit judge");
  const build=(entry:DistillationConfig["generator"],credentialEnv:string,budget:number,inputPrice:number,outputPrice:number,initialSpent=0):DistillationProvider=>{
    if(!credentialEnv)throw new Error("DISTILL_CREDENTIAL_ENV_REQUIRED");const key=env[credentialEnv];if(!key)throw new Error(`DISTILL_CREDENTIAL_MISSING: ${credentialEnv}`);
    if(!(inputPrice>0)||!(outputPrice>0))throw new Error(`DISTILL_PRICE_REQUIRED: explicit positive pinned input/output prices required for ${entry.provider}/${entry.model}`);
    const client=factory(entry.provider,key,entry.model);const transport:TeacherTransport={async invoke(request){const response=await client.invoke(request);return {response,finishReason:response.kind==="tool_calls"?"tool_calls":"stop"};}};
    return new ReliableTeacherProvider({transport,budgets:{global:budget,stage:budget,provider:budget,currency:"USD"},catalog:{price(){return {inputPerMillion:inputPrice,outputPerMillion:outputPrice,currency:"USD"};}},initialSpent,maxRetries:2,concurrency:2});
  };
  return {generator:build(config.generator,gates.generationCredentialEnv,gates.generationBudget,gates.generationInputPerMillion,gates.generationOutputPerMillion,gates.generationSpent),judge:build(config.judge,gates.judgingCredentialEnv,gates.judgingBudget,gates.judgingInputPerMillion,gates.judgingOutputPerMillion,gates.judgingSpent)};
}
