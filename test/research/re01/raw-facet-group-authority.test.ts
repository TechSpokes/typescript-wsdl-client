import assert from 'node:assert/strict';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode,Reference,SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties,ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import {createSchemaScalarKernel,compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';

const fixture=path.resolve('test/conformance/fixtures'),namespace='urn:re01:free-ur-common-mixed-payload';
const xsd='http://www.w3.org/2001/XMLSchema';
const id=(name:string)=>globalId('type',{namespace,local:name});
const local=(target:string):Reference=>({kind:'local',target});
const builtin=(name:string):Reference=>({kind:'builtin',name:{namespace:xsd,local:name}});
type Mode='matching'|'no-identity'|'shared-object'|'distinct-objects'|'shared-primitive';

async function setup(representation:'legacy'|'exact',mode:Mode){
  const loaded=await loadSchemaInput(path.join(fixture,'xsd/recovery/free-ur-common-mixed-payload.xsd'),
    {policy:{fileRoots:[fixture]}});
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
    provenance:{kind:'hypothetical-abstract',originals:[node.id]}});
  const shared={caller:'not-an-issued-component'};
  const identity=(side:'base'|'derived'):unknown=>mode==='shared-object'?shared
    :mode==='distinct-objects'?{side}:mode==='shared-primitive'?'caller-controlled':undefined;
  const scalar=(name:string,base:Reference,word:string,extra:unknown)=>{
    const node:SimpleTypeNode={...metadata,kind:'simpleType',id:id(name),
      identity:{kind:'global',role:'type',name:{namespace,local:name}},variety:{kind:'restriction',base,facets:[]}};
    const facet:ScalarFacet={name:'pattern',fixed:false,lexical:{value:word,context:a.context},
      ...(representation==='legacy'?{annotation:'absent' as const}:{})};
    // Structural extra data remains nonauthoritative even when frozen and shared.
    const group={facets:[facet],...(representation==='exact'?{annotation:'absent' as const}:{}),
      ...(extra===undefined?{}:{identity:extra})};
    const raw:RawSimpleTypeProperties={type:node.id,targetNamespace:namespace,base,final:[],variety:{kind:'atomic'},
      ...(representation==='legacy'?{facetLayers:[group]}:{facetComponentSet:[group]}),
      provenance:{kind:'hypothetical-abstract',originals:[]}};
    return {node,raw};
  };
  const anchor=scalar('CallerPatternAnchor',builtin('string'),'a',identity('base'));
  const selected=scalar('CallerPatternRestriction',local(anchor.node.id),mode==='matching'?'a':'b',identity('derived'));
  const built=request.candidate({key:representation+'-'+mode,endpoint,active:[...actual.members,anchor.node.id,selected.node.id],
    additions:[anchor.node,selected.node],rawTypes:[a,b,r,endpoint].map(row),rawSimpleTypes:[anchor.raw,selected.raw]});
  assert.equal(built.kind,'prepared');
  return {actual,context:built.context,anchor,selected,a,b,d};
}

describe.each(['legacy','exact'] as const)('raw %s facet group authority',representation=>{
  it.each(['matching','no-identity','shared-object','distinct-objects','shared-primitive'] as const)
  ('checks the complete forest without trusting %s metadata',async mode=>{
    const s=await setup(representation,mode),kernel=createSchemaScalarKernel(s.context);
    expect(s.context.members).toHaveLength(7);
    expect(checkComponentConstruction(s.context,s.anchor.node.id)).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.assess(local(s.anchor.node.id),{value:'a',context:s.a.context},s.anchor.node.id)).toMatchObject({kind:'checked'});
    expect(kernel.assess(local(s.anchor.node.id),{value:'b',context:s.a.context},s.anchor.node.id)).toMatchObject({kind:'invalid-schema'});
    const result=verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[{id:'D',parent:s.actual,context:s.context,
      target:s.d.id,intermediate:s.b.id,ancestor:local(s.a.id),premises:[]}]});
    if(mode==='matching'){
      expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error('Expected ordinary complete candidate');
      expect(result.actualComponents).toHaveLength(5);
      expect(new Set(result.actualComponents.map(value=>value.component))).toEqual(new Set(s.actual.members));
      expect(result.proof).toHaveLength(1);expect(result.proof[0].components).toHaveLength(5);
      expect(new Set(result.proof[0].components.map(value=>value.component)))
        .toEqual(new Set([s.anchor.node.id,s.selected.node.id,s.a.id,s.b.id,s.d.id]));
      for(const receipt of result.proof[0].components)expect(receipt).toMatchObject({contextId:s.context.contextId,obligations:[]});
      expect(compareSchemaFacetProperties(s.context,local(s.anchor.node.id),s.anchor.node.id,
        s.context,local(s.selected.node.id),s.selected.node.id)).toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
      expect(kernel.assess(local(s.selected.node.id),{value:'a',context:s.a.context},s.selected.node.id)).toMatchObject({kind:'checked'});
      expect(kernel.assess(local(s.selected.node.id),{value:'b',context:s.a.context},s.selected.node.id)).toMatchObject({kind:'invalid-schema'});
    }else{
      expect(result).toMatchObject({kind:'candidate-rejected',rule:'st-restrict-facets',
        component:s.selected.node.id,contextId:s.context.contextId});
      expect(kernel.describe(local(s.selected.node.id),s.selected.node.id)).toMatchObject({kind:'invalid-schema',rule:'st-restrict-facets'});
      expect(compareSchemaFacetProperties(s.context,local(s.anchor.node.id),s.anchor.node.id,
        s.context,local(s.selected.node.id),s.selected.node.id)).toMatchObject({kind:'invalid-schema',rule:'st-restrict-facets',side:'right'});
    }
  });
});
