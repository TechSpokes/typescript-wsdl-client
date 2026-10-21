import assert from 'node:assert/strict';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode,Reference,SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {createSchemaScalarKernel,compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {projectFacetAnnotation} from '../../../src/compiler/schemaFacetAnnotation.js';
import type {FacetAnnotation} from '../../../src/compiler/schemaFacetAnnotation.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode,FiniteProofStep} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleFacetInput,RawSimpleTypeProperties,RawScalarFacetComponent} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures=path.resolve('test/conformance/fixtures'),namespace='urn:re01:source-facet-current',xsd='http://www.w3.org/2001/XMLSchema';
const id=(name:string)=>globalId('type',{namespace,local:name}),local=(target:string):Reference=>({kind:'local',target});
const builtin=(name:string):Reference=>({kind:'builtin',name:{namespace:xsd,local:name}});
type Mode='enum'|'pattern'|'distinct-pattern'|'distinct-enum'|'current'|'stale'|'different'|'bound'|'omitted-bound'
  |'opaque-new'|'opaque-pending'|'forged-origin'|'integer'|'exact-base'|'back'|'combo'|'combo-bound';

async function setup(mode:Mode){
  const loaded=await loadSchemaInput(path.join(fixtures,'xsd/recovery/source-facet-current-components.xsd'),{policy:{fileRoots:[fixtures]}});
  const prepared=prepareSourceSchemaRequest(loaded);assert.equal(prepared.kind,'prepared');
  const {request}=prepared,actual=request.actual,graphBefore=JSON.stringify(request.graph);
  const complex=(name:string):ComplexTypeNode=>{const found=actual.lookup(id(name));assert.equal(found.kind,'found');assert.equal(found.node.kind,'complexType');return found.node;};
  const source=(name:string):SimpleTypeNode=>{const found=actual.lookup(id(name));assert.equal(found.kind,'found');assert.equal(found.node.kind,'simpleType');return found.node;};
  const a=complex('A'),b=complex('B'),r=complex('R'),d=complex('D');
  const annotation=(name:string):FacetAnnotation=>{
    const node=source(name);assert.equal(node.variety.kind,'restriction');
    const syntax=node.variety.facets[0].syntax.children.find(child=>child.kind==='element'&&child.name.namespace===xsd&&child.name.local==='annotation');
    return syntax?.kind==='element'?projectFacetAnnotation(syntax,request.budget):'absent';
  };
  const component=(name:string,values:readonly string[],evidence:FacetAnnotation='absent',fixed=false):RawScalarFacetComponent=>({annotation:evidence,
    facets:values.map(value=>({name,fixed,lexical:{value,context:a.context},...(['enumeration','minInclusive','minExclusive'].includes(name)
      ?{operand:{type:builtin(name==='enumeration'&&values.includes('a')?'string':'decimal'),owner:d.id,context:'active' as const}}:{})}))});
  const enumOne=(evidence:FacetAnnotation='absent')=>component('enumeration',['1'],evidence);
  const minimum=component('minExclusive',['1']);
  let base:Reference=local(id('EnumC')),input:RawSimpleFacetInput={facetComponentSet:[minimum,enumOne()]},comparison='EnumC';
  if(mode==='enum'||mode==='exact-base'){base=local(id('EnumB'));input={facetComponentSet:[enumOne()]};comparison='EnumA';}
  if(mode==='back'){base=local(id('EnumA'));input={facetComponentSet:[enumOne(annotation('EnumBack'))]};comparison='EnumBack';}
  if(mode==='pattern'){base=local(id('PatternB'));input={facetComponentSet:[component('pattern',['a'])]};comparison='PatternA';}
  if(mode==='distinct-pattern'){base=local(id('PatternB'));input={facetComponentSet:[component('pattern',['a'],annotation('PatternB')),component('pattern',['(a)'])]};comparison='PatternDistinct';}
  if(mode==='distinct-enum'){base=local(id('EnumDistinctB'));input={facetComponentSet:[component('enumeration',['1','2']),enumOne()]};comparison='EnumDistinctA';}
  if(mode==='stale'||mode==='different'||mode==='forged-origin'){
    const entry=enumOne(annotation(mode==='different'?'EnumOther':'EnumB'));
    input={facetComponentSet:[minimum,mode==='forged-origin'?Object.assign({},entry,{sourceStep:{sourceOwner:id('EnumA'),facets:[]},identity:'caller'}):entry]};
  }
  if(mode==='bound'||mode==='omitted-bound')input={facetBinding:{kind:'original',type:local(id(mode==='bound'?'EnumC':'EnumB'))}};
  if(mode==='opaque-new'){base=local(id('EnumOpaque'));input={facetComponentSet:[component('enumeration',['1','2'])]};comparison='EnumOpaque';}
  if(mode==='opaque-pending'){base=local(id('EnumOpaqueC'));input={facetComponentSet:[component('minInclusive',['2']),component('enumeration',['1','2'])]};comparison='EnumOpaqueC';}
  if(mode==='integer'){base=builtin('integer');input={facetComponentSet:[component('fractionDigits',['0'],'absent',true),
    component('pattern',['[\\-+]?[0-9]+'],annotation('IntegerPattern'))]};comparison='IntegerPattern';}
  if(mode==='combo'){base=local(id('ComboB'));input={facetComponentSet:[component('pattern',['a'],annotation('ComboB')),
    component('enumeration',['a'],annotation('ComboA'))]};comparison='ComboA';}
  if(mode==='combo-bound'){base=local(id('ComboA'));input={facetBinding:{kind:'original',type:base}};comparison='ComboA';}
  const metadata={context:a.context,declaredAttributes:[],annotations:[],retained:[],syntaxDetails:[]};
  const peer:SimpleTypeNode={...metadata,kind:'simpleType',id:id('Peer'),identity:{kind:'global',role:'type',name:{namespace,local:'Peer'}},variety:{kind:'restriction',base,facets:[]}};
  const rawPeer:RawSimpleTypeProperties={type:peer.id,targetNamespace:namespace,base,final:[],variety:{kind:'atomic'},...input,
    provenance:{kind:'hypothetical-abstract',originals:[]}};
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const row=(node:ComplexTypeNode):RawComplexTypeProperties=>({type:node.id,targetNamespace:namespace,
    derivation:{method:node.derivation?.kind??'restriction',base:node.derivation?.base??builtin('anyType')},content:{kind:'empty'},
    abstract:false,final:[],block:[],attributeUses:[],provenance:{kind:'hypothetical-abstract',originals:actual.members.includes(node.id)?[node.id]:[]}});
  const exactBase:RawSimpleTypeProperties={type:id('EnumB'),targetNamespace:namespace,base:builtin('decimal'),final:[],variety:{kind:'atomic'},
    facetComponentSet:[enumOne(annotation('EnumB'))],provenance:{kind:'hypothetical-abstract',originals:[id('EnumB')]}};
  const z:ComplexTypeNode={...metadata,kind:'complexType',id:id('Z'),identity:{kind:'global',role:'type',name:{namespace,local:'Z'}},
    abstract:false,mixed:false,attributes:[],derivation:{kind:'extension',contentKind:'complex',base:local(b.id),facets:[]}};
  const before=request.candidate({key:'source-before-child',endpoint,active:[...actual.members,z.id],additions:[z],rawTypes:[a,b,r,endpoint,z].map(row),
    rawSimpleTypes:mode==='exact-base'?[exactBase]:[]});assert.equal(before.kind,'prepared');const parent=before.context;
  const retired:ComplexTypeNode={...z,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const built=forkSemanticCandidate(parent,{key:mode,endpoint:retired,active:[...parent.members,peer.id],additions:[peer],rawTypes:[row(retired)],rawSimpleTypes:[rawPeer]});
  assert.equal(built.kind,'prepared');const child=built.context;
  const root:FiniteRe01EvidenceNode={id:'D',parent:actual,context:parent,target:d.id,intermediate:b.id,ancestor:local(a.id),premises:['Z']};
  const nested:FiniteRe01EvidenceNode={id:'Z',parent,context:child,target:z.id,intermediate:b.id,ancestor:local(a.id),premises:[]};
  return {request,actual,parent,child,peer,z,a,b,d,root,nested,comparison,graphBefore};
}

describe('actual current source facet components',()=>{
  it.each(['enum','pattern','distinct-pattern','distinct-enum','current','stale','different','bound','omitted-bound',
    'opaque-new','opaque-pending','forged-origin','integer','exact-base','back','combo','combo-bound'] as const)
  ('preserves full source, fresh roots and current component duties for %s',async mode=>{
    const s=await setup(mode),result=verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[s.root,s.nested]});
    expect(s.actual.members).toHaveLength(20);expect(s.parent.members).toHaveLength(21);expect(s.child.members).toHaveLength(22);
    const invalid=['stale','different','forged-origin','omitted-bound'].includes(mode);
    if(invalid)expect(result).toMatchObject({kind:'candidate-rejected',rule:mode==='omitted-bound'?'st-restrict-facets':'enumeration-valid-restriction',
      component:s.peer.id,contextId:s.child.contextId});
    else if(mode==='opaque-pending')expect(result).toMatchObject({kind:'unresolved',rule:'raw-simple-facet-restriction-validity',component:s.peer.id,contextId:s.child.contextId});
    else{
      expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error(JSON.stringify(result));
      expect(new Set(result.actualComponents.map(value=>value.component))).toEqual(new Set(s.actual.members));expect(result.proof).toHaveLength(2);
      for(const context of [s.parent,s.child]){
        const step:FiniteProofStep|undefined=result.proof.find(value=>value.contextId===context.contextId);assert.ok(step);
        for(const target of [s.z.id,...(context===s.child?[s.peer.id]:[])])expect(step.components.some(value=>value.component===target)).toBe(true);
        for(const receipt of step.components)expect(receipt).toMatchObject({contextId:context.contextId,obligations:[]});
      }
      const comparison=compareSchemaFacetProperties(s.child,local(id(s.comparison)),id(s.comparison),s.child,local(s.peer.id),s.peer.id);
      expect(comparison).toMatchObject({kind:'checked',value:true,annotationCorrespondence:mode==='opaque-new'?'unresolved':'equal'});
      const kernel=createSchemaScalarKernel(s.child);
      if(mode==='current'||mode==='bound')expect(kernel.assess(local(s.peer.id),{value:'1',context:s.a.context},s.peer.id)).toMatchObject({kind:'invalid-schema'});
      else expect(kernel.assess(local(s.peer.id),{value:mode.includes('pattern')||mode.startsWith('combo')?'a':'1',context:s.a.context},s.peer.id)).toMatchObject({kind:'checked',obligations:[]});
      if(mode==='integer')expect(kernel.assess(local(s.peer.id),{value:'1.5',context:s.a.context},s.peer.id)).toMatchObject({kind:'invalid-schema'});
    }
    for(const context of [s.actual,s.child])expect(checkComponentConstruction(context,id('EnumC'))).toMatchObject({kind:'checked',obligations:[]});
    expect(createSchemaScalarKernel(s.child).assess(local(id('EnumC')),{value:'1',context:s.a.context},id('EnumC'))).toMatchObject({kind:'invalid-schema'});
    expect(verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[{...s.root,premises:[]}]}))
      .toMatchObject({kind:'unresolved',rule:'missing-nested-evidence',component:s.z.id,contextId:s.parent.contextId});
    expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
  });

  it('recomputes inherited source and binding components in a later H and preserves sticky failure',async()=>{
    const s=await setup('bound'),next=forkSemanticCandidate(s.child,{key:'inherited-binding',active:s.child.members});assert.equal(next.kind,'prepared');
    expect(compareSchemaFacetProperties(s.child,local(s.peer.id),s.peer.id,next.context,local(s.peer.id),s.peer.id))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(compareSchemaFacetProperties(next.context,local(id('EnumC')),id('EnumC'),next.context,local(s.peer.id),s.peer.id))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    const kernel=createSchemaScalarKernel(next.context);s.request.budget.guard(()=>s.request.budget.chargeWork(125_000_001));
    expect(kernel.describe(local(s.peer.id),s.peer.id)).toBe(s.request.budget.failure());
  });
});
