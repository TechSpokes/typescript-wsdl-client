import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties, ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures=path.resolve('test/conformance/fixtures'),namespace='urn:re01:free-ur-common-mixed-payload';
const id=(name:string)=>globalId('type',{namespace,local:name});
const local=(target:string):Reference=>({kind:'local',target});
const builtin=(name:string):Reference=>({kind:'builtin',name:{namespace:'http://www.w3.org/2001/XMLSchema',local:name}});

async function setup(known:boolean){
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
  const anchor:SimpleTypeNode={...metadata,kind:'simpleType',id:id('InheritedScalar'),
    identity:{kind:'global',role:'type',name:{namespace,local:'InheritedScalar'}},
    variety:{kind:'restriction',base:builtin('decimal'),facets:[]}};
  const facet=(name:string,value:string):ScalarFacet=>({name,fixed:false,lexical:{value,context:a.context},
    operand:{type:builtin('decimal'),owner:d.id,context:'active'}});
  const scalar:RawSimpleTypeProperties={type:anchor.id,targetNamespace:namespace,base:builtin('decimal'),
    final:[],variety:{kind:'atomic'},facetComponentSet:[
      {facets:[facet('minInclusive','0')],...(known?{annotation:'absent' as const}:{})},
      {facets:[facet('enumeration','1')],annotation:'absent'}],
    provenance:{kind:'hypothetical-abstract',originals:[]}};
  const z:ComplexTypeNode={...metadata,kind:'complexType',id:id('UnrelatedZ'),
    identity:{kind:'global',role:'type',name:{namespace,local:'UnrelatedZ'}},
    abstract:false,mixed:false,attributes:[],
    derivation:{kind:'extension',contentKind:'complex',base:local(b.id),facets:[]}};
  const row=(node:ComplexTypeNode):RawComplexTypeProperties=>({type:node.id,targetNamespace:namespace,
    derivation:{method:node.derivation?.kind??'restriction',base:node.derivation?.base??builtin('anyType')},
    content:{kind:'empty'},abstract:false,final:[],block:[],attributeUses:[],
    provenance:{kind:'hypothetical-abstract',originals:actual.members.includes(node.id)?[node.id]:[]}});
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const built=request.candidate({key:known?'known-annotation':'unknown-annotation',endpoint,
    active:[...actual.members,anchor.id,z.id],additions:[anchor,z],
    rawTypes:[a,b,r,endpoint,z].map(row),rawSimpleTypes:[scalar]});
  assert.equal(built.kind,'prepared');const parent=built.context;
  const retired:ComplexTypeNode={...z,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const fork=forkSemanticCandidate(parent,{key:'required-Z-child',active:parent.members,endpoint:retired,rawTypes:[row(retired)]});
  assert.equal(fork.kind,'prepared');const child=fork.context;
  const root:FiniteRe01EvidenceNode={id:'D',parent:actual,context:parent,target:d.id,
    intermediate:b.id,ancestor:local(a.id),premises:['Z']};
  const nested:FiniteRe01EvidenceNode={id:'Z',parent,context:child,target:z.id,
    intermediate:b.id,ancestor:local(a.id),premises:[]};
  return {actual,parent,child,anchor,z,root,nested,target:d.id};
}

describe('inherited exact raw facet occurrence identity',()=>{
  it.each([false,true])('checks the complete two-node forest with known annotation=%s',async known=>{
    const s=await setup(known);
    const facets=compareSchemaFacetProperties(s.parent,local(s.anchor.id),s.anchor.id,
      s.child,local(s.anchor.id),s.anchor.id);
    expect(facets).toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[],
      sourceFacetAnnotations:{left:known?'absent':'unresolved',right:known?'absent':'unresolved'}});
    expect(s.child.rawSimpleTypeProperties(s.anchor.id)).toEqual(s.parent.rawSimpleTypeProperties(s.anchor.id));
    for(const context of [s.parent,s.child]){
      expect(context.members).toHaveLength(7);
      expect(checkComponentConstruction(context,s.anchor.id)).toMatchObject({kind:'checked',contextId:context.contextId,obligations:[]});
    }
    expect(checkComponentConstruction(s.parent,s.z.id)).toMatchObject({kind:'checked',re01:{primitive:false}});
    const result=verifyFiniteRe01Evidence(s.actual,s.target,{root:'D',nodes:[s.root,s.nested]});
    expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error('Expected complete inherited forest');
    expect(new Set(result.actualComponents.map(item=>item.component))).toEqual(new Set(s.actual.members));
    expect(result.actualComponents).toHaveLength(5);expect(result.proof).toHaveLength(2);
    for(const [context,count] of [[s.parent,5],[s.child,4]] as const){
      const step=result.proof.find(item=>item.contextId===context.contextId);
      expect(step).toBeDefined();if(!step)throw new Error('Missing context closure');
      expect(step.components).toHaveLength(count);
      for(const component of [s.anchor.id,s.z.id])expect(step.components.some(item=>item.component===component)).toBe(true);
      for(const receipt of step.components)expect(receipt).toMatchObject({contextId:context.contextId,obligations:[]});
    }
    expect(verifyFiniteRe01Evidence(s.actual,s.target,{root:'D',nodes:[{...s.root,premises:[]}]}))
      .toMatchObject({kind:'unresolved',rule:'missing-nested-evidence',component:s.z.id,contextId:s.parent.contextId});
  });
});
