/** Fixed-URI request calibration. Finite proofs and structural workloads retain distinct claims. */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {createSemanticBudget, DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import type {SemanticBudgetLimits} from '../../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate, prepareSemanticRequest} from '../../../src/compiler/semanticContext.js';
import {buildCanonicalGraph} from '../../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01Evidence, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {candidateSequence} from './preparation-candidates.js';
import {COMMITTED_PREPARATION_CORPUS, LARGER_REAL_TIER, syntheticSchema, verifyCorpus} from './preparation-corpus.js';

const fixtureRoot=path.resolve('test/conformance/fixtures/xsd/recovery');
const origin='https://capacity.example';
export type CapacityProfile = 'default' | 'legacy' | 'diagnostic';
export const CAPACITY_LIMITS = Object.freeze({
  default: {maxNodes: DEFAULT_MAX_NODES, maxWork: DEFAULT_MAX_WORK},
  legacy: {maxNodes: 100_000, maxWork: 1_000_000},
  diagnostic: {maxNodes: 100_000, maxWork: 100_000_000},
});
const structuralCorpora = ['weather', 'shared-recursive', 'synthetic-4', 'synthetic-16',
  'synthetic-64', 'synthetic-128', 'synthetic-256'] as const;
export type CapacityCorpus = typeof structuralCorpora[number];
export type CapacityRoute = 'generic' | 'source-owned';
const builtin=(local:string):Reference=>({kind:'builtin',name:{namespace:'http://www.w3.org/2001/XMLSchema',local}});
const local=(target:string):Reference=>({kind:'local',target});
async function input(name:string,bytes=readFileSync(path.join(fixtureRoot,name))){
  const wall=performance.now(),rss=process.memoryUsage().rss,heap=process.memoryUsage().heapUsed;
  const uri=`${origin}/${name}`;
  const digest=createHash('sha256').update(bytes).digest('hex');
  const loaded=await loadSchemaInput(uri,{policy:{allowedOrigins:[origin]},offlineResources:new Map([[uri,{bytes,digest}]])});
  return {loaded,loading:{name:'source-loading',marginalWork:null,marginalNodes:null,
    wallMs:performance.now()-wall,rssBeforeBytes:rss,rssAfterBytes:process.memoryUsage().rss,
    heapBeforeBytes:heap,heapAfterBytes:process.memoryUsage().heapUsed,processPeakRssKiB:process.resourceUsage().maxRSS},
    fixture:{name,uri,bytes:bytes.length,digest}};
}
function runStage<T>(name:string,budget:ReturnType<typeof createSemanticBudget>|undefined,stages:unknown[],task:()=>T):T{
  const before=budget?{...budget.usage()}:null, wall=performance.now(),rss=process.memoryUsage().rss,heap=process.memoryUsage().heapUsed;
  const result=task(),after=budget?{...budget.usage()}:null;
  stages.push({name,before,after,marginalWork:before&&after?after.work-before.work:null,
    marginalNodes:before&&after?after.nodes-before.nodes:null,
    wallMs:performance.now()-wall,rssBeforeBytes:rss,rssAfterBytes:process.memoryUsage().rss,
    heapBeforeBytes:heap,heapAfterBytes:process.memoryUsage().heapUsed,processPeakRssKiB:process.resourceUsage().maxRSS,
    kind:result&&typeof result==='object'&&'kind' in result?result.kind:undefined});
  return result;
}
function retainedCensus(value:unknown){
  const seen=new Set<object>(),stack:unknown[]=[value];
  let arrays=0,fields=0,stringValues=0,stringCodeUnits=0;
  while(stack.length){
    const item=stack.pop();
    if(typeof item==='string'){stringValues++;stringCodeUnits+=item.length;continue;}
    if(!item||typeof item!=='object'||seen.has(item))continue;
    seen.add(item);if(Array.isArray(item))arrays++;
    const values=Object.values(item);fields+=values.length;stack.push(...values);
  }
  return {retainedObjects:seen.size,retainedArrays:arrays,retainedFields:fields,stringValues,stringCodeUnits};
}
function receiptDigest(value:unknown){
  return createHash('sha256').update(JSON.stringify(value,(_key,item:unknown)=>
    typeof item==='bigint'?{bigint:item.toString()}:item instanceof Map?{map:[...item.entries()]}:
      item instanceof Set?{set:[...item]}:item)).digest('hex');
}
async function scalar(mode:CapacityProfile,nested:boolean){
  const {loaded,fixture,loading}=await input('finite-proof-independent.xsd');
  const budget=createSemanticBudget(CAPACITY_LIMITS[mode]),stages:unknown[]=[loading];
  const prep=runStage('source-preparation',budget,stages,()=>prepareSourceSchemaRequest(loaded,{budget}));
  if(prep.kind!=='prepared')return {workload:nested?'nested-helper':'typed-attribute',mode,fixture,stages,final:{...budget.usage()},kind:prep.kind};
  const request=prep.request,namespace='urn:recovery:finite-proof';
  const named=(name:string)=>globalId('type',{namespace,local:name});
  const node=(name:string):ComplexTypeNode=>{const result=request.actual.lookup(named(name));if(result.kind!=='found'||result.node.kind!=='complexType')throw new Error(name);return result.node};
  const {b,d}=runStage('actual-lookups',budget,stages,()=>({b:node('B'),d:node('D')}));
  const eId=named('E'),fId=named('F');
  const helper=(name:'E'|'F',base:Reference):ComplexTypeNode=>({...b,id:named(name),
    identity:{kind:'global',role:'type',name:{namespace,local:name}},attributes:[],
    derivation:{kind:'extension',contentKind:'simple',base,facets:[]}});
  const e=helper('E',builtin('anySimpleType'));
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'simple',base:local(eId),facets:[]}};
  const properties=(type:string,base:Reference,method:'extension'|'restriction',scalar:Reference,
    uses:readonly string[]=b.attributes):RawComplexTypeProperties=>({type,derivation:{base,method},abstract:false,final:[],block:[],
    content:{kind:'simple',type:scalar},attributeUses:uses,
    provenance:{kind:'hypothetical-abstract',originals:type===b.id||type===d.id?[type]:[]}});
  const additions=nested?[e,helper('F',local(b.id))]:[e];
  const rawTypes=[properties(b.id,builtin('string'),'extension',builtin('string')),
    properties(eId,builtin('anySimpleType'),'extension',builtin('anySimpleType')),
    properties(d.id,local(eId),'restriction',builtin('string')),
    ...(nested?[properties(fId,local(b.id),'extension',builtin('string'))]:[])];
  const candidate=runStage('candidate-preparation',budget,stages,()=>request.candidate({key:nested?'nested':'typed',
    active:[...request.actual.members,...additions.map(item=>item.id)],additions,endpoint,rawTypes}));
  if(candidate.kind!=='prepared')return {workload:nested?'nested-helper':'typed-attribute',mode,fixture,stages,final:{...budget.usage()},kind:candidate.kind};
  const root:FiniteRe01EvidenceNode={id:'root',parent:request.actual,context:candidate.context,target:d.id,
    intermediate:eId,ancestor:builtin('anySimpleType'),premises:[]};
  let evidence:FiniteRe01Evidence={root:'root',nodes:[root]};
  if(nested){
    const parent=candidate.context,f=parent.lookup(fId),foundE=parent.lookup(eId);
    if(f.kind!=='found'||f.node.kind!=='complexType'||foundE.kind!=='found'||foundE.node.kind!=='complexType')throw new Error('nested lookup');
    const fRaw=parent.rawTypeProperties(fId),eRaw=parent.rawTypeProperties(eId);
    if(!fRaw||!eRaw)throw new Error('nested raw');
    const fNode=f.node;
    const e2Id=named('E2'),e2:ComplexTypeNode={...foundE.node,id:e2Id,
      identity:{kind:'global',role:'type',name:{namespace,local:'E2'}}};
    const child=runStage('nested-candidate-preparation',budget,stages,()=>forkSemanticCandidate(parent,{key:'nested-helper-proof',
      active:[...parent.members,e2Id],additions:[e2],
      endpoint:{...fNode,derivation:{kind:'restriction',contentKind:'simple',base:local(e2Id),facets:[]}},
      rawTypes:[{...fRaw,derivation:{method:'restriction',base:local(e2Id)}},
        {...eRaw,type:e2Id,provenance:{kind:'hypothetical-abstract',originals:[]}}]}));
    if(child.kind!=='prepared')return {workload:'nested-helper',mode,fixture,stages,final:{...budget.usage()},kind:child.kind};
    evidence={root:'root',nodes:[{...root,premises:['child']},{id:'child',parent,context:child.context,
      target:fId,intermediate:e2Id,ancestor:builtin('anySimpleType'),premises:[]}]};
  }
  const result=runStage('finite-verification',budget,stages,()=>verifyFiniteRe01Evidence(request.actual,d.id,evidence));
  return {workload:nested?'nested-helper':'typed-attribute',mode,fixture,stages,final:{...budget.usage()},kind:result.kind,
    claims:result.kind==='checked-candidate'?result.claims:undefined,
    receiptSha256:result.kind==='checked-candidate'?receiptDigest(result):undefined,
    retained:result.kind==='checked-candidate'?retainedCensus(result):undefined};
}
async function particle(mode:CapacityProfile){
  const {loaded,fixture,loading}=await input('finite-particle-independent.xsd');
  const budget=createSemanticBudget(CAPACITY_LIMITS[mode]),stages:unknown[]=[loading];
  const prep=runStage('source-preparation',budget,stages,()=>prepareSourceSchemaRequest(loaded,{budget}));
  if(prep.kind!=='prepared')return {workload:'particle-au-wildcard',mode,fixture,stages,final:{...budget.usage()},kind:prep.kind};
  const request=prep.request,namespace='urn:recovery:finite-particle',id=(name:string)=>globalId('type',{namespace,local:name});
  const get=(name:string):ComplexTypeNode=>{const r=request.actual.lookup(id(name));if(r.kind!=='found'||r.node.kind!=='complexType')throw new Error(name);return r.node};
  const {a,b,d}=runStage('actual-lookups',budget,stages,()=>({a:get('A'),b:get('B'),d:get('D')}));
  const eId=id('E'),rootId=scopedId(eId,'/effective-sequence','particle');
  if(!b.content||!d.content)throw new Error('missing content');
  const template=request.actual.lookup(b.content);
  if(template.kind!=='found'||template.node.kind!=='particle')throw new Error('missing particle');
  const uses=b.attributes.filter(attribute=>{const found=request.actual.lookup(attribute);
    return found.kind==='found'&&found.node.kind==='attributeUse';});
  const wildcardSources=b.attributes.filter(attribute=>!uses.includes(attribute));
  const wildcard={namespace:{kind:'set' as const,namespaces:['urn:extras']},processContents:'lax' as const,sources:wildcardSources};
  const wrapper:ParticleNode={...template.node,id:rootId,identity:{kind:'scoped',owner:eId,path:'/effective-sequence',role:'particle'},
    occurs:{min:'1',max:'1'},term:{kind:'sequence',children:[b.content,d.content]}};
  const e:ComplexTypeNode={...b,id:eId,identity:{kind:'global',role:'type',name:{namespace,local:'E'}},
    content:rootId,attributes:[],derivation:{kind:'extension',contentKind:'complex',base:local(a.id),facets:[]}};
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'complex',base:local(eId),facets:[]}};
  const properties=(type:string,base:Reference,method:'extension'|'restriction',particle?:string):RawComplexTypeProperties=>({
    type,derivation:{base,method},abstract:false,final:[],block:[],
    content:particle?{kind:'element-only',particle}:{kind:'empty'},attributeUses:particle?uses:[],
    ...(particle?{wildcard}:{}),provenance:{kind:'hypothetical-abstract',originals:type===eId?[]:[type]}});
  const candidate=runStage('candidate-preparation',budget,stages,()=>request.candidate({key:'valid',
    active:[...request.actual.members,eId,rootId],additions:[e,wrapper],endpoint,
    rawTypes:[properties(a.id,builtin('anyType'),'restriction'),properties(b.id,local(a.id),'extension',b.content),
      properties(eId,local(a.id),'extension',rootId),properties(d.id,local(eId),'restriction',rootId)]}));
  if(candidate.kind!=='prepared')return {workload:'particle-au-wildcard',mode,fixture,stages,final:{...budget.usage()},kind:candidate.kind};
  const result=runStage('finite-verification',budget,stages,()=>verifyFiniteRe01Evidence(request.actual,d.id,{root:'particle',nodes:[{
    id:'particle',parent:request.actual,context:candidate.context,target:d.id,intermediate:eId,
    ancestor:local(a.id),premises:[]}]}));
  return {workload:'particle-au-wildcard',mode,fixture,stages,final:{...budget.usage()},kind:result.kind,
    claims:result.kind==='checked-candidate'?result.claims:undefined,
    receiptSha256:result.kind==='checked-candidate'?receiptDigest(result):undefined,
    retained:result.kind==='checked-candidate'?retainedCensus(result):undefined};
}

/** One actual preparation and all three candidate deltas, sharing one bounded request. */
export async function measureContextCapacity(corpus:CapacityCorpus,route:CapacityRoute,
  mode:CapacityProfile,override?:SemanticBudgetLimits){
  const committed=COMMITTED_PREPARATION_CORPUS.find(item=>item.id===corpus);
  if(committed)await verifyCorpus(committed,path.resolve('.'));
  const bytes=committed?readFileSync(committed.source):Buffer.from(syntheticSchema(Number(corpus.slice('synthetic-'.length))));
  const name=committed?path.basename(committed.source):`${corpus}.xsd`;
  const {loaded,fixture,loading}=await input(name,bytes);
  const limits=override??CAPACITY_LIMITS[mode],budget=createSemanticBudget(limits),stages:unknown[]=[loading];
  // These inherited stages are deliberately separate from semantic request work.
  // The generic adapter owns the complete graph snapshot; the authenticated
  // source route uses the accepted #278 immutable source/graph sharing.
  const prepared=route==='source-owned'
    ?runStage('source-owned-actual-preparation',budget,stages,()=>prepareSourceSchemaRequest(loaded,{budget}))
    :(()=>{
      const graph=runStage('canonical-build',undefined,stages,()=>buildCanonicalGraph(loaded));
      const resolved=runStage('reference-resolution',undefined,stages,()=>resolveCanonicalGraph(graph));
      return runStage('generic-actual-preparation',budget,stages,()=>prepareSemanticRequest(resolved,{budget}));
    })();
  const metadata={workload:`${route}:${corpus}`,mode,limits,fixture,stages,acceptance:'structural-only',
    corpusTier:committed?.tier??'synthetic',basis:committed?.basis??'Graded shared-group and independently recursive types; no real-service claim.'};
  if(prepared.kind!=='prepared')return {...metadata,kind:prepared.kind,final:{...budget.usage()},candidates:[]};
  const request=prepared.request,deltas=candidateSequence(request.graph.nodes),candidates=[];
  for(const delta of deltas){
    const result=runStage(`candidate:${delta.key}`,budget,stages,()=>request.candidate(delta));
    candidates.push({key:delta.key,kind:result.kind,activeMembers:delta.active.length,
      endpointChanged:Boolean(delta.endpoint),...(result.kind==='prepared'?{membersSha256:receiptDigest(result.context.members)}:{})});
    if(result.kind!=='prepared'){
      const before={...budget.usage()};
      const retry=request.candidate(deltas[0]!);
      return {...metadata,kind:result.kind,final:before,candidates,stickyFailure:retry===result,
        unchangedUsage:JSON.stringify(before)===JSON.stringify(budget.usage())};
    }
  }
  return {...metadata,kind:'prepared' as const,final:{...budget.usage()},candidates,
    graphComponents:request.graph.nodes.length,graphSha256:receiptDigest(request.graph),retained:retainedCensus(request.graph)};
}

/** Text and shared cyclic inputs bound variable work without a semantic negative result. */
export function measureAdversarialCapacity(mode:CapacityProfile){
  const stages:unknown[]=[];
  const textBudget=createSemanticBudget(CAPACITY_LIMITS[mode]);
  const text='x'.repeat(CAPACITY_LIMITS[mode].maxWork+1);
  const oversized=runStage('oversized-text-snapshot',textBudget,stages,
    ()=>textBudget.guard(()=>textBudget.snapshot({value:text})));
  const before={...textBudget.usage()};let invoked=false;
  const retry=textBudget.guard(()=>{invoked=true;return 'partial';});
  const shared:{children?:unknown[];text:string}={text:'shared'};
  shared.children=[shared,shared];
  const sharingBudget=createSemanticBudget(CAPACITY_LIMITS[mode]);
  const sharing=runStage('cyclic-shared-snapshot',sharingBudget,stages,
    ()=>sharingBudget.guard(()=>sharingBudget.freeze(sharingBudget.snapshot(shared))));
  const preserved='children' in sharing&&sharing.children?.[0]===sharing&&sharing.children[1]===sharing;
  const nodeBudget=createSemanticBudget(CAPACITY_LIMITS[mode]);
  const nodes=runStage('inclusive-node-reservation',nodeBudget,stages,()=>nodeBudget.guard(()=>{
    nodeBudget.reserveNodes(CAPACITY_LIMITS[mode].maxNodes);
    nodeBudget.reserveNodes(1);
  }));
  return {workload:'adversarial',mode,stages,kind:'controls',oversized:{result:oversized,stickyFailure:retry===oversized,
    unchangedUsage:JSON.stringify(before)===JSON.stringify(textBudget.usage()),invoked},
    sharedCycle:{preserved,usage:{...sharingBudget.usage()}},nodes};
}

export function measureFiniteCapacity(workload:'particle-au-wildcard'|'nested-helper'|'typed-attribute',profile:CapacityProfile){
  return workload==='particle-au-wildcard'?particle(profile):scalar(profile,workload==='nested-helper');
}

const workloads=['particle-au-wildcard','nested-helper','typed-attribute',
  ...structuralCorpora.flatMap(corpus=>[`generic:${corpus}`,`source-owned:${corpus}`]),'adversarial'];
async function runWorkload(workload:string,profile:CapacityProfile){
  if(workload==='particle-au-wildcard')return particle(profile);
  if(workload==='nested-helper')return scalar(profile,true);
  if(workload==='typed-attribute')return scalar(profile,false);
  if(workload==='adversarial')return measureAdversarialCapacity(profile);
  const [route,corpus]=workload.split(':');
  return measureContextCapacity(corpus as CapacityCorpus,route as CapacityRoute,profile);
}
function sourceDigests(){
  const files:string[]=[];
  const visit=(directory:string):void=>{
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())visit(file);else if(entry.name.endsWith('.ts'))files.push(file);
    }
  };
  visit('src');visit('test/research/re01');files.push('package-lock.json');
  return Object.fromEntries(files.sort().map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
}
async function main(){
  const arg=(name:string):string|undefined=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
  const profile=arg('--profile');
  if(profile!=='default'&&profile!=='legacy'&&profile!=='diagnostic')throw new Error('Pass --profile default, legacy or diagnostic');
  const selected=arg('--workload');
  if(selected&&!workloads.includes(selected))throw new Error('Unknown workload');
  if(process.argv.includes('--worker')){
    if(!selected)throw new Error('Worker requires --workload');
    const results=[];
    for(let iteration=0;iteration<3;iteration++)results.push({iteration,
      phase:iteration===0?'cold-process-first-call':'warm-process-repeat',...await runWorkload(selected,profile)});
    process.stdout.write(JSON.stringify(results));return;
  }
  const sources=sourceDigests();
  const results=workloads.filter(workload=>!selected||selected===workload).flatMap(workload=>{
    process.stderr.write(`Measuring ${workload} ${profile}\n`);
    const output=execFileSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--worker',
      '--profile',profile,'--workload',workload],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:60_000});
    return JSON.parse(output) as unknown[];
  });
  if(JSON.stringify(sources)!==JSON.stringify(sourceDigests()))throw new Error('Source changed during measurement');
  process.stdout.write(JSON.stringify({format:'semantic-capacity-v2',
    revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    trackedDiffSha256:createHash('sha256').update(execFileSync('git',['diff','HEAD','--','src'],{encoding:'utf8'})).digest('hex'),
    sourceDigests:sources,node:process.version,platform:process.platform,architecture:process.arch,
    cpu:os.cpus()[0]?.model,fixedOrigin:origin,profile,limits:CAPACITY_LIMITS[profile],largerRealTier:LARGER_REAL_TIER,
    collection:'Each workload/profile has a fresh child, three requests and stable request-ID lengths. Loading/build/resolution use inherited limits; null shared work is not zero cost. Stages are marginal request work; terminal reservation is separate. RSS peak is process lifetime high-water, heap/RSS snapshots are observed and not allocations; retained census is a proxy. Wall time includes OS/JIT/GC noise. Structural candidates certify no schema validity; finite checks certify only supplied evidence.',results},null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
