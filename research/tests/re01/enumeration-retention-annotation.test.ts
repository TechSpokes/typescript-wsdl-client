import assert from 'node:assert/strict';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode,Reference,SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {createSchemaScalarKernel,compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawScalarFacetComponent,RawSimpleTypeProperties,ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import type {FacetAnnotation} from '../../../src/compiler/schemaFacetAnnotation.js';

const fixtures=path.resolve('test/conformance/fixtures'),namespace='urn:re01:free-ur-common-mixed-payload';
const xsd='http://www.w3.org/2001/XMLSchema';
const id=(name:string)=>globalId('type',{namespace,local:name});
const local=(target:string):Reference=>({kind:'local',target});
const builtin=(name:string):Reference=>({kind:'builtin',name:{namespace:xsd,local:name}});
const present:FacetAnnotation={kind:'present',content:{kind:'element',name:{namespace:xsd,local:'annotation'},
  attributes:[],namespaces:{xs:xsd},children:[{kind:'element',name:{namespace:xsd,local:'documentation'},
    attributes:[],namespaces:{xs:xsd},children:[{kind:'text',value:'retained'}]}]}};
type Variant='retained'|'changed-annotation'|'retained-plus-two'|'retained-plus-one'|'unknown-annotation';

async function setup(variant:Variant){
  const loaded=await loadSchemaInput(path.join(fixtures,'xsd/recovery/free-ur-common-mixed-payload.xsd'),
    {policy:{fileRoots:[fixtures]}});
  const prepared=prepareSourceSchemaRequest(loaded);assert.equal(prepared.kind,'prepared');
  const {request}=prepared,actual=request.actual;
  const original=(name:string):ComplexTypeNode=>{
    const found=actual.lookup(id(name));assert.equal(found.kind,'found');
    assert.equal(found.node.kind,'complexType');return found.node;
  };
  const a=original('A'),b=original('B'),r=original('R'),d=original('D');
  const metadata={context:a.context,declaredAttributes:[],annotations:[],retained:[],syntaxDetails:[]};
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const row=(node:ComplexTypeNode):RawComplexTypeProperties=>({type:node.id,targetNamespace:namespace,
    derivation:{method:node.derivation?.kind??'restriction',base:node.derivation?.base??builtin('anyType')},
    content:{kind:'empty'},abstract:false,final:[],block:[],attributeUses:[],
    provenance:{kind:'hypothetical-abstract',originals:actual.members.includes(node.id)?[node.id]:[]}});
  const facet=(name:string,value:string):ScalarFacet=>({name,fixed:false,lexical:{value,context:a.context},
    operand:{type:builtin('decimal'),owner:d.id,context:'active'}});
  const minimum:RawScalarFacetComponent={facets:[facet('minInclusive','2')],annotation:'absent'};
  const enumeration=(values:readonly string[],annotation:FacetAnnotation):RawScalarFacetComponent=>
    ({facets:values.map(value=>facet('enumeration',value)),annotation});
  const retained=enumeration(['1','2'],present);
  const scalar=(name:string,base:Reference,components:readonly RawScalarFacetComponent[])=>{
    const node:SimpleTypeNode={...metadata,kind:'simpleType',id:id(name),
      identity:{kind:'global',role:'type',name:{namespace,local:name}},variety:{kind:'restriction',base,facets:[]}};
    const raw:RawSimpleTypeProperties={type:node.id,targetNamespace:namespace,base,final:[],variety:{kind:'atomic'},
      facetComponentSet:components,provenance:{kind:'hypothetical-abstract',originals:[]}};
    return {node,raw};
  };
  const anchor=scalar('EnumAnchor',builtin('decimal'),[minimum,retained]);
  const baseline=request.candidate({key:'anchor-only',endpoint,active:[...actual.members,anchor.node.id],additions:[anchor.node],
    rawTypes:[a,b,r,endpoint].map(row),rawSimpleTypes:[anchor.raw]});
  assert.equal(baseline.kind,'prepared');
  const baselineForest=verifyFiniteRe01Evidence(actual,d.id,{root:'D',nodes:[
    {id:'D',parent:actual,context:baseline.context,target:d.id,intermediate:b.id,ancestor:local(a.id),premises:[]}]});
  const z:ComplexTypeNode={...metadata,kind:'complexType',id:id('EnumSupportZ'),
    identity:{kind:'global',role:'type',name:{namespace,local:'EnumSupportZ'}},abstract:false,mixed:false,attributes:[],
    derivation:{kind:'extension',contentKind:'complex',base:local(b.id),facets:[]}};
  const built=request.candidate({key:'before-required-child',endpoint,active:[...actual.members,anchor.node.id,z.id],
    additions:[anchor.node,z],rawTypes:[a,b,r,endpoint,z].map(row),rawSimpleTypes:[anchor.raw]});
  assert.equal(built.kind,'prepared');const parent=built.context;
  const components=variant==='changed-annotation'?[minimum,enumeration(['1','2'],'absent')]
    :variant==='unknown-annotation'?[minimum,{facets:retained.facets}]
    :variant==='retained'?[minimum,retained]
      :[minimum,retained,enumeration([variant==='retained-plus-two'?'2':'1'],'absent')];
  const selected=scalar('EnumRestriction',local(anchor.node.id),components);
  const retired:ComplexTypeNode={...z,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const fork=forkSemanticCandidate(parent,{key:variant,endpoint:retired,active:[...parent.members,selected.node.id],
    additions:[selected.node],rawTypes:[row(retired)],rawSimpleTypes:[selected.raw]});
  assert.equal(fork.kind,'prepared');const child=fork.context;
  const root:FiniteRe01EvidenceNode={id:'D',parent:actual,context:parent,target:d.id,
    intermediate:b.id,ancestor:local(a.id),premises:['Z']};
  const nested:FiniteRe01EvidenceNode={id:'Z',parent,context:child,target:z.id,
    intermediate:b.id,ancestor:local(a.id),premises:[]};
  return {actual,parent,child,anchor,selected,z,a,b,d,root,nested,baseline,baselineForest};
}

describe('enumeration component retention and new introduction',()=>{
  it.each(['retained','changed-annotation','retained-plus-two','retained-plus-one','unknown-annotation'] as const)
  ('checks the complete current-context frontier for %s',async variant=>{
    const s=await setup(variant),valid=variant==='retained'||variant==='retained-plus-two';
    expect(s.baseline.context.members).toHaveLength(6);
    expect(s.baselineForest.kind).toBe('checked-candidate');
    if(s.baselineForest.kind!=='checked-candidate')throw new Error('Expected independently formed anchor');
    expect(s.baselineForest.actualComponents).toHaveLength(5);
    expect(s.baselineForest.proof[0].components).toHaveLength(4);
    expect(s.parent.members).toHaveLength(7);expect(s.child.members).toHaveLength(8);
    expect(s.child.rawSimpleTypeProperties(s.anchor.node.id)).toEqual(s.parent.rawSimpleTypeProperties(s.anchor.node.id));
    for(const context of [s.baseline.context,s.parent,s.child]){
      const kernel=createSchemaScalarKernel(context);
      expect(checkComponentConstruction(context,s.anchor.node.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.assess(local(s.anchor.node.id),{value:'2',context:s.a.context},s.anchor.node.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.assess(local(s.anchor.node.id),{value:'1',context:s.a.context},s.anchor.node.id)).toMatchObject({kind:'invalid-schema'});
    }
    expect(checkComponentConstruction(s.parent,s.z.id)).toMatchObject({kind:'checked',re01:{primitive:false}});
    const result=verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[s.root,s.nested]});
    if(valid){
      expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error('Expected complete candidate');
      expect(new Set(result.actualComponents.map(value=>value.component))).toEqual(new Set(s.actual.members));
      expect(result.actualComponents).toHaveLength(5);expect(result.proof).toHaveLength(2);
      for(const context of [s.parent,s.child]){
        const step=result.proof.find(value=>value.contextId===context.contextId);expect(step).toBeDefined();
        if(!step)throw new Error('Missing exact context receipt');expect(step.components).toHaveLength(5);
        const components=[s.anchor.node.id,s.z.id,s.a.id,s.b.id,context===s.parent?s.d.id:s.selected.node.id];
        expect(new Set(step.components.map(value=>value.component))).toEqual(new Set(components));
        for(const receipt of step.components)expect(receipt).toMatchObject({contextId:context.contextId,obligations:[]});
      }
      const kernel=createSchemaScalarKernel(s.child),formed=kernel.describe(local(s.selected.node.id),s.selected.node.id);
      expect(formed).toMatchObject({kind:'checked',obligations:[],typeDependencies:expect.arrayContaining([
        {contextId:s.child.contextId,type:{kind:'component',id:s.anchor.node.id}},
        {contextId:s.child.contextId,type:{kind:'builtin',name:{namespace:xsd,local:'decimal'}}},
      ])});
      expect(kernel.assess(local(s.selected.node.id),{value:'2',context:s.a.context},s.selected.node.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.assess(local(s.selected.node.id),{value:'1',context:s.a.context},s.selected.node.id)).toMatchObject({kind:'invalid-schema'});
      if(variant==='retained')expect(compareSchemaFacetProperties(s.parent,local(s.anchor.node.id),s.anchor.node.id,
        s.child,local(s.selected.node.id),s.selected.node.id)).toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
    }else if(variant==='unknown-annotation'){
      expect(result).toMatchObject({kind:'unresolved',rule:'raw-simple-facet-restriction-validity',
        component:s.selected.node.id,contextId:s.child.contextId});
      expect(createSchemaScalarKernel(s.child).describe(local(s.selected.node.id),s.selected.node.id))
        .toMatchObject({kind:'checked',obligations:[{rule:'raw-simple-facet-restriction-validity',component:s.selected.node.id}]});
    }else expect(result).toMatchObject({kind:'candidate-rejected',rule:'enumeration-valid-restriction',
      component:s.selected.node.id,contextId:s.child.contextId});
    expect(verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[{...s.root,premises:[]}]}))
      .toMatchObject({kind:'unresolved',rule:'missing-nested-evidence',component:s.z.id,contextId:s.parent.contextId});
  });
});
