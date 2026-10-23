import assert from 'node:assert/strict';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode,Reference,SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {createSchemaScalarKernel,compareSchemaFacetProperties} from '../../../src/compiler/schemaScalarKernel.js';
import {projectFacetAnnotation} from '../../../src/compiler/schemaFacetAnnotation.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep,FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawFacetComponentEntry,RawScalarFacetComponent,RawSimpleFacetInput,RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures=path.resolve('test/conformance/fixtures'),namespace='urn:re01:source-facet-current',xsd='http://www.w3.org/2001/XMLSchema';
const id=(name:string)=>globalId('type',{namespace,local:name}),local=(target:string):Reference=>({kind:'local',target});
const builtin=(name:string):Reference=>({kind:'builtin',name:{namespace:xsd,local:name}});
type Mode='keep'|'endpoint'|'empty'|'bad-endpoint'|'bad-enum'|'omitted'|'literal'|'forged'|'bad-index'|'pattern'
  |'current'|'historical'|'distinct-pattern'|'distinct-enum'|'combo'|'integer'|'list'|'union'|'qname'|'bad-literal'|'raw-direct'|'raw-ancestor'
  |'qname-opaque'|'qname-bad-enum'|'qname-omitted'|'qname-literal'|'qname-forged'|'qname-raw-ancestor'
  |'ud-opaque'|'ud-new-enum'|'ud-omitted'|'ud-literal'|'ud-legacy'|'ud-binding'|'ud-forged'|'ud-known'|'ud-raw-direct'|'ud-raw-ancestor'
  |'ud-aliased'|'ud-nested'|'ud-many'|'ud-string'|'ud-empty-table';

async function setup(mode:Mode,birthPeer=false){
  const loaded=await loadSchemaInput(path.join(fixtures,'xsd/recovery/source-component-retention.xsd'),{policy:{fileRoots:[fixtures]}});
  const prepared=prepareSourceSchemaRequest(loaded);assert.equal(prepared.kind,'prepared');
  const {request}=prepared,actual=request.actual,graphBefore=JSON.stringify(request.graph);
  const complex=(name:string):ComplexTypeNode=>{const found=actual.lookup(id(name));assert.equal(found.kind,'found');assert.equal(found.node.kind,'complexType');return found.node;};
  const a=complex('A'),b=complex('B'),r=complex('R'),d=complex('D');
  const qname=mode==='qname'||mode.startsWith('qname-');
  const union=mode.startsWith('ud-');
  let lexicalContext=a.context;
  if(qname){
    const found=actual.lookup(id(mode==='qname'?'SourceQName':mode==='qname-raw-ancestor'?'QNameKnownB':'QNameOpaqueB'));
    assert.equal(found.kind,'found');assert.equal(found.node.kind,'simpleType');assert.equal(found.node.variety.kind,'restriction');
    lexicalContext=found.node.variety.facets[0].lexical.context;
  }
  const component=(name:string,...values:string[]):RawScalarFacetComponent=>({annotation:'absent',facets:values.map(value=>({name,fixed:false,
    lexical:{value,context:lexicalContext},...(['enumeration','minInclusive','maxInclusive'].includes(name)
      ?{operand:{type:builtin(qname?'QName':'decimal'),owner:d.id,context:'active' as const}}:{})}))});
  let base=local(id('EnumOpaqueC')),entries:RawFacetComponentEntry[]=[{baseComponent:0},{baseComponent:1}];
  let variety:RawSimpleTypeProperties['variety']={kind:'atomic'};
  if(mode==='endpoint'||mode==='bad-endpoint'||mode==='empty')entries.push(component('maxInclusive',mode==='bad-endpoint'?'3':'2'));
  if(mode==='empty')entries.push(component('pattern','a'),component('pattern','b'));
  if(mode==='bad-enum')entries.push(component('enumeration','1'));
  if(mode==='omitted')entries=[{baseComponent:0}];
  if(mode==='literal'||mode==='forged'){
    const enumeration={facets:component('enumeration','1','2').facets};
    entries=[component('minInclusive','2'),mode==='forged'?Object.assign({},enumeration,{annotationIdentity:'caller',identity:'caller'}):enumeration];
  }
  if(mode==='bad-index')entries=[{baseComponent:2}];
  if(mode==='pattern'){base=local(id('PatternOpaque'));entries=[{baseComponent:0}];}
  if(mode==='current'||mode==='historical'){base=local(id('EnumA'));entries=[{baseComponent:mode==='historical'?1:0}];}
  if(mode==='distinct-pattern')base=local(id('PatternDistinct'));
  if(mode==='distinct-enum')base=local(id('EnumDistinctA'));
  if(mode==='combo')base=local(id('ComboA'));
  if(mode==='integer'||mode==='bad-literal'){base=local(id('IntegerPattern'));entries=[{baseComponent:0}];}
  if(mode==='bad-literal')entries.push(component('minInclusive','not-a-decimal'));
  if(mode==='list'){base=local(id('SourceList'));entries=[{baseComponent:0}];variety={kind:'list',item:builtin('string')};}
  if(mode==='union'){base=local(id('SourceUnion'));entries=[{baseComponent:0}];variety={kind:'union',members:[builtin('string'),builtin('decimal')]};}
  if(mode==='qname'){base=local(id('SourceQName'));entries=[{baseComponent:0}];}
  if(mode.startsWith('qname-')){
    base=local(id(mode==='qname-raw-ancestor'?'QNameKnownA':'QNameOpaqueA'));
    entries=[{baseComponent:0},{baseComponent:1},component('pattern','(p:a)')];
    if(mode==='qname-bad-enum')entries.push(component('enumeration','p:b'));
    if(mode==='qname-omitted')entries=[{baseComponent:0},component('pattern','(p:a)')];
    if(mode==='qname-literal'||mode==='qname-forged'){
      const enumeration={facets:component('enumeration','p:a','p:b').facets};
      entries=[mode==='qname-forged'?Object.assign({},enumeration,{identity:'caller',annotationIdentity:'caller'}):enumeration,
        component('pattern','p:a'),component('pattern','(p:a)')];
    }
  }
  if(union){
    const guarded:Partial<Record<Mode,string>>={'ud-aliased':'UnionAliasedA','ud-nested':'UnionNestedA','ud-many':'UnionManyA','ud-string':'UnionStringA'};
    base=local(id(guarded[mode]??(mode==='ud-empty-table'?'DecimalUnion0':mode==='ud-raw-direct'?'DecimalUnionKnownB'
      :mode==='ud-known'||mode==='ud-raw-ancestor'?'DecimalUnionKnownA':'DecimalUnionA')));
    const member=mode==='ud-aliased'?local(id('SourceDecimalAlias')):builtin(mode==='ud-string'?'string':'decimal');
    variety={kind:'union',members:mode==='ud-many'?[member,member]:[member]};
    entries=[{baseComponent:0},{baseComponent:1},component('pattern','(1)')];
    if(mode==='ud-new-enum')entries.push(component('enumeration','2'));
    if(mode==='ud-omitted'||mode==='ud-raw-direct')entries=[{baseComponent:0},component('pattern','(1)')];
    if(mode==='ud-empty-table')entries=[{baseComponent:0}];
    if(['ud-literal','ud-forged','ud-legacy','ud-known'].includes(mode)){
      const enumeration={...(mode==='ud-known'?{annotation:'absent' as const}:{}),facets:component('enumeration','1','2').facets};
      entries=[mode==='ud-forged'?Object.assign({},enumeration,{identity:'caller',annotationIdentity:'caller'}):enumeration,
        component('pattern','1'),component('pattern','(1)')];
    }
  }
  if(mode==='raw-direct'||mode==='raw-ancestor'){base=local(id(mode==='raw-direct'?'EnumB':'EnumA'));entries=[{baseComponent:0}];}
  const metadata={context:a.context,declaredAttributes:[],annotations:[],retained:[],syntaxDetails:[]};
  const peerPath='/$source-'+mode;
  const peer:SimpleTypeNode={...metadata,kind:'simpleType',id:qname||union?hypotheticalScopedId(a.id,peerPath,'simpleType'):id('SelectedPeer'),
    identity:qname||union?{kind:'scoped',owner:a.id,path:peerPath,role:'simpleType'}:{kind:'global',role:'type',name:{namespace,local:'SelectedPeer'}},
    variety:{kind:'restriction',base,facets:[]}};
  let input:RawSimpleFacetInput={facetComponentSet:entries};
  if(mode==='ud-legacy')input={facetLayers:entries.map(entry=>{assert.ok('facets'in entry);return {facets:entry.facets};})};
  if(mode==='ud-binding'){
    const carrier=actual.lookup(globalId('element',{namespace,local:'decimal-union-tau'}));assert.equal(carrier.kind,'found');assert.equal(carrier.node.kind,'element');
    input={facetBinding:{kind:'original',type:carrier.node.type}};
  }
  const raw:RawSimpleTypeProperties={type:peer.id,targetNamespace:namespace,base,final:[],variety,...input,
    provenance:{kind:'hypothetical-abstract',originals:[]}};
  const endpoint:ComplexTypeNode={...d,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const row=(node:ComplexTypeNode):RawComplexTypeProperties=>({type:node.id,targetNamespace:namespace,
    derivation:{method:node.derivation?.kind??'restriction',base:node.derivation?.base??builtin('anyType')},content:{kind:'empty'},
    abstract:false,final:[],block:[],attributeUses:[],provenance:{kind:'hypothetical-abstract',originals:actual.members.includes(node.id)?[node.id]:[]}});
  const z:ComplexTypeNode={...metadata,kind:'complexType',id:id('SelectionZ'),identity:{kind:'global',role:'type',name:{namespace,local:'SelectionZ'}},
    abstract:false,mixed:false,attributes:[],derivation:{kind:'extension',contentKind:'complex',base:local(b.id),facets:[]}};
  const rawBases:RawSimpleTypeProperties[]=[];
  if(mode==='raw-direct'||mode==='raw-ancestor'){
    const found=actual.lookup(id('EnumB'));assert.equal(found.kind,'found');assert.equal(found.node.kind,'simpleType');assert.equal(found.node.variety.kind,'restriction');
    const syntax=found.node.variety.facets[0].syntax.children.find(child=>child.kind==='element'&&child.name.namespace===xsd&&child.name.local==='annotation');
    assert.ok(syntax?.kind==='element');
    rawBases.push({type:found.node.id,targetNamespace:namespace,base:builtin('decimal'),final:[],variety:{kind:'atomic'},
      facetComponentSet:[{...component('enumeration','1'),annotation:projectFacetAnnotation(syntax,request.budget)}],
      provenance:{kind:'hypothetical-abstract',originals:[found.node.id]}});
  }
  if(mode==='qname-raw-ancestor')rawBases.push({type:id('QNameKnownB'),targetNamespace:namespace,base:builtin('QName'),final:[],variety:{kind:'atomic'},
    facetComponentSet:[component('enumeration','p:a','p:b')],provenance:{kind:'hypothetical-abstract',originals:[id('QNameKnownB')]}});
  // Source XML has no explicit typed-operand syntax. This genuine RAW ancestor
  // carries such operands without pretending to be an immutable SOURCE facet.
  if(mode==='ud-raw-ancestor'||mode==='ud-raw-direct')rawBases.push({type:id('DecimalUnionKnownB'),targetNamespace:namespace,base:local(id('DecimalUnion0')),
    final:[],variety:{kind:'union',members:[builtin('decimal')]},facetComponentSet:[component('enumeration','1','2')],
    provenance:{kind:'hypothetical-abstract',originals:[id('DecimalUnionKnownB')]}});
  const before=request.candidate({key:'source-selector-parent',endpoint,active:[...actual.members,z.id,...(birthPeer?[peer.id]:[])],additions:[z,...(birthPeer?[peer]:[])],
    rawTypes:[a,b,r,endpoint,z].map(row),rawSimpleTypes:[...rawBases,...(birthPeer?[raw]:[])]});assert.equal(before.kind,'prepared');const parent=before.context;
  const retired:ComplexTypeNode={...z,derivation:{kind:'restriction',contentKind:'complex',base:local(b.id),facets:[]}};
  const built=forkSemanticCandidate(parent,{key:mode,endpoint:retired,active:[...parent.members,...(birthPeer?[]:[peer.id])],
    additions:birthPeer?[]:[peer],rawTypes:[row(retired)],rawSimpleTypes:birthPeer?[]:[raw]});
  assert.equal(built.kind,'prepared');const child=built.context;
  const root:FiniteRe01EvidenceNode={id:'D',parent:actual,context:parent,target:d.id,intermediate:b.id,ancestor:local(a.id),premises:['Z']};
  const nested:FiniteRe01EvidenceNode={id:'Z',parent,context:child,target:z.id,intermediate:b.id,ancestor:local(a.id),premises:[]};
  return {request,actual,parent,child,peer,raw,z,a,b,d,root,nested,base,graphBefore,lexicalContext};
}

describe('authentic current SOURCE component retention',()=>{
  it.each(['keep','endpoint','empty','bad-endpoint','bad-enum','omitted','literal','forged','bad-index','pattern',
    'current','historical','distinct-pattern','distinct-enum','combo','integer','list','union','qname','bad-literal','raw-direct','raw-ancestor',
    'qname-opaque','qname-bad-enum','qname-omitted','qname-forged','qname-raw-ancestor',
    'ud-opaque','ud-new-enum','ud-omitted','ud-literal','ud-legacy','ud-binding','ud-forged','ud-known','ud-raw-direct','ud-raw-ancestor',
    'ud-aliased','ud-nested','ud-many','ud-string','ud-empty-table'] as const)
  ('preserves complete source and required fresh-child duties for %s',async mode=>{
    const s=await setup(mode),result=verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[s.root,s.nested]});
    if(mode==='pattern'){
      const source=s.actual.lookup(id('PatternOpaque'));assert.equal(source.kind,'found');assert.equal(source.node.kind,'simpleType');assert.equal(source.node.variety.kind,'restriction');
      expect(source.node.variety.facets.map(facet=>facet.lexical.value)).toEqual(['a','b','a']);
    }
    expect(s.actual.members).toHaveLength(46);expect(s.parent.members).toHaveLength(47);expect(s.child.members).toHaveLength(48);
    const qualified=['literal','forged','qname-forged','ud-literal','ud-legacy','ud-binding','ud-forged'].includes(mode);
    // INTEGER ordinal0 keeps only fractionDigits, omitting its patterns.
    // The unfaceted UNION constructor has a known empty component inventory.
    const failures:Partial<Record<Mode,string>>={'bad-endpoint':'maxInclusive-value','bad-enum':'enumeration-valid-restriction',
      omitted:'st-restrict-facets','bad-index':'raw-base-facet-component',historical:'raw-base-facet-component',
      integer:'st-restrict-facets',union:'raw-base-facet-component',
      'qname-bad-enum':'enumeration-valid-restriction','qname-omitted':'st-restrict-facets',
      'ud-new-enum':'enumeration-valid-restriction','ud-omitted':'st-restrict-facets','ud-empty-table':'raw-base-facet-component'};
    if(qualified)expect(result).toMatchObject({kind:'unresolved',rule:'raw-simple-facet-restriction-validity',component:s.peer.id,contextId:s.child.contextId});
    else if(mode==='bad-literal')expect(result).toMatchObject({kind:'candidate-rejected',component:s.peer.id,contextId:s.child.contextId});
    else if(failures[mode])expect(result).toMatchObject({kind:'candidate-rejected',rule:failures[mode],component:s.peer.id,contextId:s.child.contextId});
    else{
      expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error(JSON.stringify(result));
      expect(new Set(result.actualComponents.map(receipt=>receipt.component))).toEqual(new Set(s.actual.members));expect(result.proof).toHaveLength(2);
      for(const context of [s.parent,s.child]){
        const proof:FiniteProofStep|undefined=result.proof.find(step=>step.contextId===context.contextId);assert.ok(proof);
        for(const fresh of [s.z.id,...(context===s.child?[s.peer.id]:[])])expect(proof.components.some(receipt=>receipt.component===fresh)).toBe(true);
        for(const receipt of proof.components)expect(receipt).toMatchObject({contextId:context.contextId,obligations:[]});
      }
      const kernel=createSchemaScalarKernel(s.child),word=mode.startsWith('ud-')?'1':mode==='qname'?'p:item':mode.startsWith('qname-')?'p:a'
        :['pattern','distinct-pattern','combo'].includes(mode)?'a':['current','distinct-enum','raw-direct','raw-ancestor'].includes(mode)?'1':'2';
      expect(kernel.assess(local(s.peer.id),{value:word,context:s.lexicalContext},s.peer.id)).toMatchObject({kind:mode==='empty'?'invalid-schema':'checked'});
      if(mode==='keep'||mode==='pattern'||mode==='combo')expect(compareSchemaFacetProperties(s.child,s.base,s.peer.id,s.child,local(s.peer.id),s.peer.id))
        .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
      expect(kernel.describe(local(s.peer.id),s.peer.id)).toMatchObject({kind:'checked',obligations:[],typeDependencies:expect.arrayContaining([
        {contextId:s.child.contextId,type:{kind:'component',id:s.base.kind==='local'?s.base.target:''}}])});
      if(mode==='qname-opaque'||mode==='ud-opaque'){
        const qname=mode==='qname-opaque',sourceName=qname?'QNameOpaqueA':'DecimalUnionA';
        const carrier=s.child.lookup(globalId('element',{namespace,local:qname?'qname-opaque-tau':'decimal-union-tau'}));assert.equal(carrier.kind,'found');assert.equal(carrier.node.kind,'element');
        const template=s.child.resolve(carrier.node.type),peer=s.child.lookup(s.peer.id);assert.equal(template.kind,'found');assert.equal(peer.kind,'found');
        expect(compareComponentProperties(s.child,peer.node,template.node)).toMatchObject({kind:'checked',value:true,scalarObligations:[]});
        expect(compareSchemaFacetProperties(s.child,local(s.peer.id),s.peer.id,s.child,carrier.node.type,s.peer.id))
          .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
        for(const context of [s.actual,s.parent,s.child]){
          const source=createSchemaScalarKernel(context);expect(checkComponentConstruction(context,id(sourceName))).toMatchObject({kind:'checked',obligations:[]});
          expect(source.assess(local(id(sourceName)),{value:qname?'p:a':'1',context:s.lexicalContext},id(sourceName))).toMatchObject({kind:'checked',obligations:[]});
          expect(source.assess(local(id(sourceName)),{value:qname?'p:b':'2',context:s.lexicalContext},id(sourceName))).toMatchObject({kind:'invalid-schema'});
        }
        expect(kernel.assess(local(s.peer.id),{value:qname?'p:b':'2',context:s.lexicalContext},s.peer.id)).toMatchObject({kind:'invalid-schema'});
      }
    }
    if(mode==='qname-forged'){
      const plain=await setup('qname-literal');expect(verifyFiniteRe01Evidence(plain.actual,plain.d.id,{root:'D',nodes:[plain.root,plain.nested]}))
        .toMatchObject({kind:'unresolved',rule:'raw-simple-facet-restriction-validity',component:plain.peer.id});
    }
    if(mode==='qname-raw-ancestor')expect(createSchemaScalarKernel(s.child).describe(local(id('QNameKnownB')),s.peer.id))
      .toMatchObject({kind:'checked',obligations:[]});
    if(mode==='ud-raw-ancestor'||mode==='ud-raw-direct'){
      expect(createSchemaScalarKernel(s.child).describe(local(id('DecimalUnionKnownB')),s.peer.id)).toMatchObject({kind:'checked',obligations:[]});
      const overlay=s.child.rawSimpleTypeProperties(id('DecimalUnionKnownB'));assert.ok(overlay?.facetComponentSet);
      expect(overlay.facetComponentSet).toMatchObject([{facets:[{operand:{context:'active'}},{operand:{context:'active'}}]}]);
    }
    if(['ud-aliased','ud-nested','ud-many','ud-string'].includes(mode)){
      const description=createSchemaScalarKernel(s.child).describe(s.base,s.peer.id);expect(description).toMatchObject({kind:'checked',obligations:[]});
      if(mode==='ud-nested'){
        assert.equal(description.kind,'checked');expect(description.value.members).toMatchObject([builtin('decimal')]);
        const constructor=s.actual.lookup(id('UnionNested'));assert.equal(constructor.kind,'found');assert.equal(constructor.node.kind,'simpleType');
        assert.equal(constructor.node.variety.kind,'union');expect(constructor.node.variety.members[0].kind).not.toBe('builtin');
      }
    }
    if(mode.startsWith('ud-')&&['ud-literal','ud-legacy','ud-binding','ud-forged'].includes(mode)){
      expect(checkComponentConstruction(s.child,s.peer.id)).toMatchObject({kind:'checked',obligations:[{rule:'raw-simple-facet-restriction-validity',contextId:s.child.contextId}]});
    }
    for(const context of [s.actual,s.parent,s.child])expect(checkComponentConstruction(context,id('EnumOpaqueC'))).toMatchObject({kind:'checked',obligations:[]});
    expect(createSchemaScalarKernel(s.child).assess(local(id('EnumOpaqueC')),{value:'1',context:s.a.context},id('EnumOpaqueC'))).toMatchObject({kind:'invalid-schema'});
    expect(verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[{...s.root,premises:[]}]}))
      .toMatchObject({kind:'unresolved',rule:'missing-nested-evidence',component:s.z.id,contextId:s.parent.contextId});
    expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
  });

  it.each(['keep','qname-opaque','ud-opaque'] as const)('checks a source-selected %s peer born with Z throughout the complete retirement child',async mode=>{
    const s=await setup(mode,true),result=verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[s.root,s.nested]});
    expect(s.actual.members).toHaveLength(46);expect(s.parent.members).toHaveLength(48);expect(s.child.members).toHaveLength(48);
    expect(result.kind).toBe('checked-candidate');if(result.kind!=='checked-candidate')throw new Error(JSON.stringify(result));
    expect(new Set(result.actualComponents.map(receipt=>receipt.component))).toEqual(new Set(s.actual.members));expect(result.proof).toHaveLength(2);
    for(const context of [s.parent,s.child]){
      const proof:FiniteProofStep|undefined=result.proof.find(step=>step.contextId===context.contextId);assert.ok(proof);
      for(const fresh of [s.z.id,s.peer.id])expect(proof.components.some(receipt=>receipt.component===fresh)).toBe(true);
      for(const receipt of proof.components)expect(receipt).toMatchObject({contextId:context.contextId,obligations:[]});
      const kernel=createSchemaScalarKernel(context);
      expect(kernel.describe(local(s.peer.id),s.peer.id)).toMatchObject({kind:'checked',obligations:[],typeDependencies:expect.arrayContaining([
        {contextId:context.contextId,type:{kind:'component',id:id(mode==='keep'?'EnumOpaqueC':mode==='qname-opaque'?'QNameOpaqueA':'DecimalUnionA')}},
        {contextId:context.contextId,type:{kind:'builtin',name:{namespace:xsd,local:mode==='qname-opaque'?'QName':'decimal'}}}])});
      let counterpart=s.base;
      if(mode==='qname-opaque'||mode==='ud-opaque'){
        const carrier=context.lookup(globalId('element',{namespace,local:mode==='qname-opaque'?'qname-opaque-tau':'decimal-union-tau'}));assert.equal(carrier.kind,'found');assert.equal(carrier.node.kind,'element');
        counterpart=carrier.node.type;
      }
      expect(compareSchemaFacetProperties(context,counterpart,s.peer.id,context,local(s.peer.id),s.peer.id))
        .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
      expect(kernel.assess(local(s.peer.id),{value:mode==='keep'?'2':mode==='qname-opaque'?'p:a':'1',context:s.lexicalContext},s.peer.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.assess(local(s.peer.id),{value:mode==='keep'?'1':mode==='qname-opaque'?'p:b':'2',context:s.lexicalContext},s.peer.id)).toMatchObject({kind:'invalid-schema'});
    }
    expect(s.child.rawSimpleTypeProperties(s.peer.id)).toEqual(s.parent.rawSimpleTypeProperties(s.peer.id));
    expect(compareSchemaFacetProperties(s.parent,local(s.peer.id),s.peer.id,s.child,local(s.peer.id),s.peer.id))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(verifyFiniteRe01Evidence(s.actual,s.d.id,{root:'D',nodes:[{...s.root,premises:[]}]}))
      .toMatchObject({kind:'unresolved',rule:'missing-nested-evidence',component:s.z.id,contextId:s.parent.contextId});
    expect(JSON.stringify(s.request.graph)).toBe(s.graphBefore);
  });

  it.each(['keep','qname-opaque','ud-opaque'] as const)('keeps inherited %s ordinals and metadata independent of property/table read order with sticky accounting',async mode=>{
    const s=await setup(mode),next=forkSemanticCandidate(s.child,{key:'inherited',active:s.child.members});assert.equal(next.kind,'prepared');
    const sourceBefore=compareSchemaFacetProperties(s.child,s.base,s.peer.id,next.context,s.base,s.peer.id);
    expect(sourceBefore).toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(checkComponentConstruction(next.context,s.peer.id)).toMatchObject({kind:'checked',obligations:[]});
    expect(compareSchemaFacetProperties(s.child,local(s.peer.id),s.peer.id,next.context,local(s.peer.id),s.peer.id))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(compareSchemaFacetProperties(s.child,s.base,s.peer.id,next.context,s.base,s.peer.id)).toEqual(sourceBefore);
    expect(next.context.rawSimpleTypeProperties(s.peer.id)).toEqual(s.child.rawSimpleTypeProperties(s.peer.id));
    expect(forkSemanticCandidate(s.child,{key:'late',active:s.child.members,rawSimpleTypes:[s.raw]})).toMatchObject({kind:'candidate-rejected',code:'representation'});
    const kernel=createSchemaScalarKernel(next.context);
    if(mode==='qname-opaque'){
      const before=JSON.stringify(s.lexicalContext.namespaces),rebound={...s.lexicalContext,namespaces:{...s.lexicalContext.namespaces,p:'urn:re01:other-qname'}};
      expect(kernel.assess(local(s.peer.id),{value:'p:a',context:s.lexicalContext},s.peer.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.assess(local(s.peer.id),{value:'p:a',context:rebound},s.peer.id)).toMatchObject({kind:'invalid-schema',rule:'cvc-enumeration-valid'});
      expect(JSON.stringify(s.lexicalContext.namespaces)).toBe(before);
    }
    if(mode==='ud-opaque'){
      const before=JSON.stringify(s.lexicalContext.namespaces),unrelated={...s.lexicalContext,namespaces:{...s.lexicalContext.namespaces,p:'urn:re01:unrelated'}};
      expect(kernel.assess(local(s.peer.id),{value:'1',context:unrelated},s.peer.id)).toMatchObject({kind:'checked',obligations:[]});
      expect(JSON.stringify(s.lexicalContext.namespaces)).toBe(before);
    }
    s.request.budget.guard(()=>s.request.budget.chargeWork(125_000_001));
    expect(kernel.describe(local(s.peer.id),s.peer.id)).toBe(s.request.budget.failure());
  });
});
