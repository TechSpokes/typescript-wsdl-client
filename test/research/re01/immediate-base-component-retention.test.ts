import assert from 'node:assert/strict';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode,Reference,SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {compareSchemaFacetProperties,createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep,FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawFacetComponentEntry,RawScalarFacetComponent,RawSimpleTypeProperties,ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures=path.resolve('test/conformance/fixtures'),namespace='urn:re01:free-ur-common-mixed-payload';
const id=(name:string)=>globalId('type',{namespace,local:name});
const local=(target:string):Reference=>({kind:'local',target});
const builtin=(name:string):Reference=>({kind:'builtin',name:{namespace:'http://www.w3.org/2001/XMLSchema',local:name}});
type Mode='keep'|'new-endpoint'|'bad-endpoint'|'whole-duplicates'|'partial-duplicates'|'repeat-whole'|'repeat-partial'|'new-enum'|'bad-enum'|'overlap-pattern'|'disjoint-pattern'|'literal-copy'
  |'new-enum-pattern'|'omit-enum-keep'|'omit-pattern-keep'|'pending-enum-literal';

async function setup(mode:Mode){
  const loaded=await loadSchemaInput(path.join(fixtures,'xsd/recovery/free-ur-common-mixed-payload.xsd'),{policy:{fileRoots:[fixtures]}});
  const prepared=prepareSourceSchemaRequest(loaded);assert.equal(prepared.kind,'prepared');
  const {request}=prepared,actual=request.actual;
  const original=(name:string):ComplexTypeNode=>{
    const found=actual.lookup(id(name));assert.equal(found.kind,'found');assert.equal(found.node.kind,'complexType');return found.node;
  };
  const a=original('A'),b=original('B'),r=original('R'),d=original('D');
  const metadata={context:a.context,declaredAttributes:[],annotations:[],retained:[],syntaxDetails:[]};
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const row=(node:ComplexTypeNode):RawComplexTypeProperties=>({type:node.id,targetNamespace:namespace,
    derivation:{method:node.derivation?.kind??'restriction',base:node.derivation?.base??builtin('anyType')},
    content:{kind:'empty'},abstract:false,final:[],block:[],attributeUses:[],
    provenance:{kind:'hypothetical-abstract',originals:actual.members.includes(node.id)?[node.id]:[]}});
  const facet=(name:string,value:string):ScalarFacet=>({name,fixed:false,lexical:{value,context:a.context},
    ...(['enumeration','minInclusive','maxInclusive'].includes(name)?{operand:{type:builtin('decimal'),owner:d.id,context:'active' as const}}:{})});
  const entry=(name:string,...values:readonly string[]):RawScalarFacetComponent=>({facets:values.map(value=>facet(name,value)),annotation:'absent'});
  const minimum:RawScalarFacetComponent={facets:[facet('minInclusive','2')]};
  const enumeration:RawScalarFacetComponent={facets:[facet('enumeration','1'),facet('enumeration','2')]};
  const duplicated=['whole-duplicates','partial-duplicates','repeat-partial'].includes(mode);
  const newEnumPattern=['new-enum-pattern','omit-enum-keep','omit-pattern-keep','pending-enum-literal'].includes(mode);
  const patterned=mode==='overlap-pattern'||mode==='disjoint-pattern'||newEnumPattern;
  const pattern:RawScalarFacetComponent=newEnumPattern?{facets:[facet('pattern','2')]}:entry('pattern','2');
  const components=[minimum,enumeration,...(duplicated?[{facets:enumeration.facets}]:[]),...(patterned?[pattern]:[])];
  const scalar=(name:string,base:Reference,facetComponentSet:readonly RawFacetComponentEntry[])=>{
    const node:SimpleTypeNode={...metadata,kind:'simpleType',id:id(name),identity:{kind:'global',role:'type',name:{namespace,local:name}},
      variety:{kind:'restriction',base,facets:[]}};
    const raw:RawSimpleTypeProperties={type:node.id,targetNamespace:namespace,base,final:[],variety:{kind:'atomic'},facetComponentSet,
      provenance:{kind:'hypothetical-abstract',originals:[]}};return {node,raw};
  };
  const anchor=scalar('OpaqueAnchor',builtin('decimal'),components);
  const z:ComplexTypeNode={...metadata,kind:'complexType',id:id('SelectorZ'),identity:{kind:'global',role:'type',name:{namespace,local:'SelectorZ'}},
    abstract:false,mixed:false,attributes:[],derivation:{kind:'extension',contentKind:'complex',base:local(b.id),facets:[]}};
  const built=request.candidate({key:'before-child',endpoint,active:[...actual.members,anchor.node.id,z.id],additions:[anchor.node,z],
    rawTypes:[a,b,r,endpoint,z].map(row),rawSimpleTypes:[anchor.raw]});
  assert.equal(built.kind,'prepared');const parent=built.context;
  const selected:RawFacetComponentEntry[]=mode==='literal-copy'?[minimum,enumeration]:[{baseComponent:0},{baseComponent:1}];
  if(mode==='whole-duplicates'||patterned)selected.push({baseComponent:2});
  if(mode==='repeat-partial'||mode==='repeat-whole')selected.push({baseComponent:1});
  if(mode==='new-endpoint'||mode==='bad-endpoint')selected.push(entry('maxInclusive',mode==='new-endpoint'?'2':'3'));
  if(mode==='new-enum'||mode==='bad-enum'||newEnumPattern)selected.push(entry('enumeration',mode==='bad-enum'?'1':'2'));
  if(mode==='overlap-pattern'||mode==='disjoint-pattern')selected.push(entry('pattern',mode==='overlap-pattern'?'2':'3'));
  if(mode==='omit-enum-keep')selected.splice(selected.findIndex(component=>'baseComponent' in component&&component.baseComponent===1),1);
  if(mode==='omit-pattern-keep')selected.splice(selected.findIndex(component=>'baseComponent' in component&&component.baseComponent===2),1);
  if(mode==='pending-enum-literal')selected.splice(selected.findIndex(component=>'baseComponent' in component&&component.baseComponent===1),1,enumeration);
  const restriction=scalar('OpaqueRestriction',local(anchor.node.id),selected);
  const retired:ComplexTypeNode={...z,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const fork=forkSemanticCandidate(parent,{key:mode,endpoint:retired,active:[...parent.members,restriction.node.id],additions:[restriction.node],
    rawTypes:[row(retired)],rawSimpleTypes:[restriction.raw]});
  assert.equal(fork.kind,'prepared');const child=fork.context;
  const root:FiniteRe01EvidenceNode={id:'D',parent:actual,context:parent,target:d.id,intermediate:b.id,ancestor:local(a.id),premises:['Z']};
  const nested:FiniteRe01EvidenceNode={id:'Z',parent,context:child,target:z.id,intermediate:b.id,ancestor:local(a.id),premises:[]};
  return {request,actual,parent,child,anchor,restriction,z,a,b,d,root,nested,scalar,entry};
}

describe('authentic immediate-base component retention',()=>{
  it.each(['keep','new-endpoint','bad-endpoint','whole-duplicates','partial-duplicates','repeat-whole','repeat-partial','new-enum','bad-enum','overlap-pattern','disjoint-pattern','literal-copy',
    'new-enum-pattern','omit-enum-keep','omit-pattern-keep','pending-enum-literal'] as const)
  ('checks the complete current-H frontier for %s',async mode=>{
    const s=await setup(mode),valid=['keep','new-endpoint','whole-duplicates','repeat-whole','new-enum','new-enum-pattern','disjoint-pattern'].includes(mode);
    expect(s.parent.members).toHaveLength(7);expect(s.child.members).toHaveLength(8);
    for(const context of [s.parent,s.child])expect(checkComponentConstruction(context,s.anchor.node.id))
      .toMatchObject({kind:'checked',contextId:context.contextId,obligations:[]});
    expect(checkComponentConstruction(s.parent,s.z.id)).toMatchObject({kind:'checked',re01:{primitive:false}});
    const result=verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[s.root,s.nested]});
    const kernel=createSchemaScalarKernel(s.child);
    if(valid){
      expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error(JSON.stringify(result));
      expect(result.actualComponents).toHaveLength(5);
      expect(new Set(result.actualComponents.map(value=>value.component))).toEqual(new Set(s.actual.members));
      expect(result.proof).toHaveLength(2);
      for(const context of [s.parent,s.child]){
        const proof:FiniteProofStep|undefined=result.proof.find(value=>value.contextId===context.contextId);assert.ok(proof);
        expect(new Set(proof.components.map(value=>value.component)))
          .toEqual(new Set([s.a.id,s.b.id,s.anchor.node.id,s.z.id,context===s.parent?s.d.id:s.restriction.node.id]));
        for(const receipt of proof.components)expect(receipt).toMatchObject({contextId:context.contextId,obligations:[]});
      }
      expect(kernel.describe(local(s.restriction.node.id),s.restriction.node.id)).toMatchObject({kind:'checked',obligations:[],
        typeDependencies:expect.arrayContaining([{contextId:s.child.contextId,type:{kind:'component',id:s.anchor.node.id}},
          {contextId:s.child.contextId,type:{kind:'builtin',name:{namespace:'http://www.w3.org/2001/XMLSchema',local:'decimal'}}}])});
      expect(kernel.contentProperties(local(s.restriction.node.id),s.restriction.node.id))
        .toMatchObject({kind:'checked',value:{definition:s.restriction.node.id,base:local(s.anchor.node.id)}});
      expect(s.restriction.node.id).not.toBe(s.anchor.node.id);
      expect(kernel.assess(local(s.anchor.node.id),{value:'2',context:s.a.context},s.anchor.node.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.assess(local(s.anchor.node.id),{value:'1',context:s.a.context},s.anchor.node.id)).toMatchObject({kind:'invalid-schema'});
      if(mode==='keep'||mode==='whole-duplicates'||mode==='repeat-whole'){
        expect(compareSchemaFacetProperties(s.child,local(s.anchor.node.id),s.anchor.node.id,s.child,local(s.restriction.node.id),s.restriction.node.id))
          .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
        expect(kernel.assess(local(s.restriction.node.id),{value:'2',context:s.a.context},s.restriction.node.id)).toMatchObject({kind:'checked',obligations:[]});
      }
      if(mode==='new-enum'||mode==='new-enum-pattern'){
        expect(kernel.assess(local(s.restriction.node.id),{value:'2',context:s.a.context},s.restriction.node.id)).toMatchObject({kind:'checked',obligations:[]});
        expect(kernel.assess(local(s.restriction.node.id),{value:'1',context:s.a.context},s.restriction.node.id)).toMatchObject({kind:'invalid-schema'});
      }
    }else if(mode==='bad-endpoint'||mode==='bad-enum')expect(result).toMatchObject({kind:'candidate-rejected',
      rule:mode==='bad-endpoint'?'maxInclusive-value':'enumeration-valid-restriction',component:s.restriction.node.id,contextId:s.child.contextId});
    else if(mode==='omit-enum-keep'||mode==='omit-pattern-keep')expect(result).toMatchObject({kind:'candidate-rejected',
      rule:'st-restrict-facets',component:s.restriction.node.id,contextId:s.child.contextId});
    else expect(result).toMatchObject({kind:'unresolved',rule:'raw-simple-facet-restriction-validity',component:s.restriction.node.id,contextId:s.child.contextId});
    expect(verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[{...s.root,premises:[]}]}))
      .toMatchObject({kind:'unresolved',rule:'missing-nested-evidence',component:s.z.id,contextId:s.parent.contextId});
  });

  it('rebuilds inherited selector rows and permits acyclic co-born bases in reverse input order',async()=>{
    const s=await setup('keep');
    const next=forkSemanticCandidate(s.child,{key:'inherited',active:s.child.members});assert.equal(next.kind,'prepared');
    expect(compareSchemaFacetProperties(s.child,local(s.restriction.node.id),s.restriction.node.id,next.context,local(s.restriction.node.id),s.restriction.node.id))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(next.context.rawSimpleTypeProperties(s.restriction.node.id)).toEqual(s.child.rawSimpleTypeProperties(s.restriction.node.id));
    const followed=s.scalar('FollowedRestriction',local(s.restriction.node.id),[{baseComponent:0},{baseComponent:1}]);
    const chained=forkSemanticCandidate(next.context,{key:'selected-base',active:[...next.context.members,followed.node.id],
      additions:[followed.node],rawSimpleTypes:[followed.raw]});assert.equal(chained.kind,'prepared');
    expect(createSchemaScalarKernel(chained.context).describe(local(followed.node.id),followed.node.id))
      .toMatchObject({kind:'checked',obligations:[],typeDependencies:expect.arrayContaining([
        {contextId:chained.context.contextId,type:{kind:'component',id:s.restriction.node.id}}])});
    const base=s.scalar('CoBornBase',builtin('decimal'),[s.entry('minInclusive','0')]);
    const derived=s.scalar('CoBornDerived',local(base.node.id),[{baseComponent:0}]);
    const candidate=forkSemanticCandidate(s.child,{key:'co-born-reverse',active:[...s.child.members,base.node.id,derived.node.id],
      additions:[derived.node,base.node],rawSimpleTypes:[derived.raw,base.raw]});assert.equal(candidate.kind,'prepared');
    expect(checkComponentConstruction(candidate.context,derived.node.id)).toMatchObject({kind:'checked',obligations:[]});
    const cycleBase={...base.raw,base:local(derived.node.id)},cycleNode={...base.node,variety:{kind:'restriction' as const,base:local(derived.node.id),facets:[]}};
    const cyclic=forkSemanticCandidate(s.child,{key:'cycle',active:[...s.child.members,base.node.id,derived.node.id],
      additions:[derived.node,cycleNode],rawSimpleTypes:[derived.raw,cycleBase]});
    expect(cyclic).toMatchObject({kind:'candidate-rejected'});
  });

  it('separates bad ordinals, known empty tables and stored first-birth violations',async()=>{
    const s=await setup('keep');
    const indexed=s.scalar('BadIndex',local(s.anchor.node.id),[{baseComponent:9}]);
    const empty=s.scalar('EmptyBuiltinTable',builtin('decimal'),[{baseComponent:0}]);
    for(const selected of [indexed,empty]){
      const prepared=forkSemanticCandidate(s.child,{key:'table-'+selected.node.id,active:[...s.child.members,selected.node.id],
        additions:[selected.node],rawSimpleTypes:[selected.raw]});assert.equal(prepared.kind,'prepared');
      expect(createSchemaScalarKernel(prepared.context).describe(local(selected.node.id),selected.node.id))
        .toMatchObject({kind:'invalid-schema',rule:'raw-base-facet-component'});
    }
    const malformed=s.scalar('BadLiteralWithValidOrdinal',local(s.anchor.node.id),[{baseComponent:0},s.entry('minInclusive','not-a-decimal')]);
    const invalid=forkSemanticCandidate(s.child,{key:'valid-ordinal-independent-literal',active:[...s.child.members,malformed.node.id],
      additions:[malformed.node],rawSimpleTypes:[malformed.raw]});assert.equal(invalid.kind,'prepared');
    expect(createSchemaScalarKernel(invalid.context).describe(local(malformed.node.id),malformed.node.id))
      .toMatchObject({kind:'invalid-schema',rule:'cvc-datatype-valid'});
    expect(forkSemanticCandidate(s.child,{key:'change-inherited',active:s.child.members,rawSimpleTypes:[s.restriction.raw]}))
      .toMatchObject({kind:'candidate-rejected',code:'representation',component:s.restriction.node.id});
    const late=s.scalar('Late',local(s.anchor.node.id),[{baseComponent:0},{baseComponent:1}]);
    const first=forkSemanticCandidate(s.child,{key:'late-without-row',active:[...s.child.members,late.node.id],additions:[late.node]});
    assert.equal(first.kind,'prepared');
    const inactive=forkSemanticCandidate(first.context,{key:'inactive-late',active:s.child.members});assert.equal(inactive.kind,'prepared');
    expect(forkSemanticCandidate(inactive.context,{key:'reactivate-with-selector',active:[...s.child.members,late.node.id],rawSimpleTypes:[late.raw]}))
      .toMatchObject({kind:'candidate-rejected',code:'representation',component:late.node.id});
  });
});
