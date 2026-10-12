/** Fixed-URI complete finite controls. Each row owns a fresh semantic request. */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01Evidence, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtureRoot=path.resolve('test/conformance/fixtures/xsd/recovery');
const origin='https://capacity.example';
const builtin=(local:string):Reference=>({kind:'builtin',name:{namespace:'http://www.w3.org/2001/XMLSchema',local}});
const local=(target:string):Reference=>({kind:'local',target});
async function input(name:string){
  const wall=performance.now(),rss=process.memoryUsage().rss,heap=process.memoryUsage().heapUsed;
  const bytes=readFileSync(path.join(fixtureRoot,name)),uri=`${origin}/${name}`;
  const digest=createHash('sha256').update(bytes).digest('hex');
  const loaded=await loadSchemaInput(uri,{policy:{allowedOrigins:[origin]},offlineResources:new Map([[uri,{bytes,digest}]])});
  return {loaded,loading:{name:'source-loading',marginalWork:null,marginalNodes:null,
    wallMs:performance.now()-wall,rssBeforeBytes:rss,rssAfterBytes:process.memoryUsage().rss,
    heapBeforeBytes:heap,heapAfterBytes:process.memoryUsage().heapUsed,processPeakRssKiB:process.resourceUsage().maxRSS},
    fixture:{name,uri,bytes:bytes.length,digest}};
}
function runStage<T>(name:string,budget:ReturnType<typeof createSemanticBudget>,stages:unknown[],task:()=>T):T{
  const before={...budget.usage()}, wall=performance.now(),rss=process.memoryUsage().rss,heap=process.memoryUsage().heapUsed;
  const result=task(),after={...budget.usage()};
  stages.push({name,before,after,marginalWork:after.work-before.work,marginalNodes:after.nodes-before.nodes,
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
async function scalar(mode:'default'|'diagnostic',nested:boolean){
  const {loaded,fixture,loading}=await input('finite-proof-independent.xsd');
  const budget=createSemanticBudget(mode==='default'?{}:{maxWork:100_000_000}),stages:unknown[]=[loading];
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
async function particle(mode:'default'|'diagnostic'){
  const {loaded,fixture,loading}=await input('finite-particle-independent.xsd');
  const budget=createSemanticBudget(mode==='default'?{}:{maxWork:100_000_000}),stages:unknown[]=[loading];
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
const selected=process.argv[process.argv.indexOf('--profile')+1];
if(selected!=='default'&&selected!=='diagnostic')throw new Error('Pass --profile default or --profile diagnostic');
const results=[];
for(let iteration=0;iteration<3;iteration++){
  const phase=iteration===0?'cold-process-first-call':'warm-process-repeat';
  results.push({iteration,phase,...await particle(selected)},
    {iteration,phase,...await scalar(selected,true)},{iteration,phase,...await scalar(selected,false)});
}
process.stdout.write(JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  trackedDiffSha256:createHash('sha256').update(execFileSync('git',['diff','HEAD','--','src'],{encoding:'utf8'})).digest('hex'),
  node:process.version,platform:process.platform,architecture:process.arch,fixedOrigin:origin,profile:selected,
  limit:{nodes:100000,defaultWork:1000000,diagnosticWork:100000000},
  collection:'Each row uses a fresh request; loading has inherited limits and null shared work. RSS is observed process memory; retained census is a reachable-object/string proxy, not V8 allocation bytes. Wall time includes OS/GC noise.',results},null,2)+'\n');
