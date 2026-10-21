import {describe, expect, it} from 'vitest';
import {compareSchemaFacetProperties, createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import {compareFacetAnnotation, validateFacetAnnotation} from '../../src/compiler/schemaFacetAnnotation.js';
import type {FacetAnnotation} from '../../src/compiler/schemaFacetAnnotation.js';
import {createSemanticBudget, DEFAULT_MAX_WORK} from '../../src/compiler/semanticBudget.js';
import {validateRawSimpleTypeShape} from '../../src/compiler/schemaSimpleTypeProperties.js';
import type {RawFacetComponentEntry,RawScalarFacetComponent, RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';
import type {Reference,SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import {originalSimpleSetup, builtin, id, named} from './helpers/original-simple-correspondence.js';

const xsd = 'http://www.w3.org/2001/XMLSchema';
const namespaces = {xml:'http://www.w3.org/XML/1998/namespace','':'',xs:xsd,
  t:'urn:recovery:original-simple-properties',p:'urn:recovery:facet-value',q:'urn:recovery:facet-value'};
const annotation = (message:string):FacetAnnotation => ({kind:'present',content:{kind:'element',name:{namespace:xsd,local:'annotation'},
  attributes:[],namespaces,children:[{kind:'element',name:{namespace:xsd,local:'documentation'},attributes:[],namespaces,
    children:[{kind:'text',value:message}]}]}});
const richAnnotation=(lang='en',source='urn:recovery:facet-appinfo',message='Payload.'):FacetAnnotation=>({kind:'present',
  content:{kind:'element',name:{namespace:xsd,local:'annotation'},attributes:[],namespaces,children:[
    {kind:'element',name:{namespace:xsd,local:'documentation'},attributes:[{name:{namespace:'http://www.w3.org/XML/1998/namespace',local:'lang'},value:lang}],
      namespaces,children:[{kind:'text',value:'Documented facet.'}]},
    {kind:'element',name:{namespace:xsd,local:'appinfo'},attributes:[{name:{namespace:'',local:'source'},value:source}],namespaces,
      children:[{kind:'element',name:{namespace:'urn:recovery:facet-markup',local:'note'},
        attributes:[{name:{namespace:'',local:'code'},value:'A'}],namespaces:{...namespaces,m:'urn:recovery:facet-markup'},
        children:[{kind:'text',value:message}]}]}
  ]}});
const exact = (raw: ReturnType<Awaited<ReturnType<typeof originalSimpleSetup>>['raw']>,
  components:readonly RawScalarFacetComponent[]):RawSimpleTypeProperties => {
  const {facetLayers: _legacy, ...properties}=raw;
  return {...properties,facetComponentSet:components};
};
const component=(facet:ScalarFacet,evidence:FacetAnnotation|undefined=facet.annotation):RawScalarFacetComponent=>{
  const {annotation:_operand,...value}=facet;
  return evidence===undefined?{facets:[value]}:{facets:[value],annotation:evidence};
};
async function selectorSetup(){
  const s=await originalSimpleSetup(),names=new Map<string,string>();
  const facet=(name:string,value:string,fixed=false):ScalarFacet=>{
    const {annotation:_annotation,...result}=s.facet(name,value,fixed);
    return ['enumeration','minInclusive','maxInclusive'].includes(name)?{...result,operand:{type:builtin('decimal'),owner:id('D'),context:'active'}}:result;
  };
  const entry=(name:string,value:string,fixed=false):RawScalarFacetComponent=>({facets:[facet(name,value,fixed)],annotation:'absent'});
  const raw=(name:string,base:Reference,facetComponentSet:readonly RawFacetComponentEntry[],
    variety:RawSimpleTypeProperties['variety']={kind:'atomic'}):RawSimpleTypeProperties & {base:Reference;facetComponentSet:readonly RawFacetComponentEntry[]}=>{
    names.set(id(name),name);return {type:id(name),base,variety,final:[],facetComponentSet,provenance:{kind:'hypothetical-abstract',originals:[]}};
  };
  const candidate=(rows:readonly (RawSimpleTypeProperties & {base:Reference})[])=>{
    const additions:SimpleTypeNode[]=rows.map(row=>({...s.seed,id:row.type,
      identity:{kind:'global',role:'type',name:{namespace:s.seed.identity.kind==='global'?s.seed.identity.name.namespace:'',local:names.get(row.type)!}},
      variety:{kind:'restriction',base:row.base,facets:[]}}));
    const prepared=s.request.candidate({key:'component-selectors',active:[...s.request.actual.members,...additions.map(node=>node.id)],
      additions,rawSimpleTypes:rows});
    if(prepared.kind!=='prepared')throw new Error(JSON.stringify(prepared));
    return {context:prepared.context,kernel:createSchemaScalarKernel(prepared.context)};
  };
  return {...s,facet,entry,raw,candidate};
}

describe('exact supplied facet component and annotation evidence',()=>{
  it('validates own ordinal data without granting caller metadata or invoking accessors',async()=>{
    const s=await selectorSetup(),base=s.raw('SelectorShape',builtin('decimal'),[]);
    for(const index of [0,Number.MAX_SAFE_INTEGER])expect(validateRawSimpleTypeShape({...base,facetComponentSet:[{baseComponent:index}]},createSemanticBudget())).toBe(true);
    for(const index of [-1,0.5,Number.MAX_SAFE_INTEGER+1,'0',NaN])
      expect(validateRawSimpleTypeShape({...base,facetComponentSet:[{baseComponent:index}]},createSemanticBudget())).toBe(false);
    for(const selected of [{baseComponent:0,annotation:'absent'},{baseComponent:0,annotation:undefined},{baseComponent:0,facets:undefined}])
      expect(validateRawSimpleTypeShape({...base,facetComponentSet:[selected]},createSemanticBudget())).toBe(false);
    let accessed=0;const getter={get baseComponent(){accessed++;return 0;}};
    expect(validateRawSimpleTypeShape({...base,facetComponentSet:[getter]},createSemanticBudget())).toBe(false);expect(accessed).toBe(0);
    // An extra ordinal on a literal is ignored, just like caller identity.
    const literal={...s.entry('minInclusive','0'),baseComponent:-1,identity:'caller'};
    const {kernel}=s.candidate([s.raw('LiteralOrdinal',builtin('decimal'),[literal])]);
    expect(kernel.describe(named('LiteralOrdinal'),id('LiteralOrdinal'))).toMatchObject({kind:'checked',obligations:[]});
    const original={...base,type:id('Empty'),facetComponentSet:[{baseComponent:0}]};
    expect(s.request.candidate({key:'original-selector',active:s.request.actual.members,rawSimpleTypes:[original]}))
      .toMatchObject({kind:'candidate-rejected',code:'representation',component:id('Empty')});
  });

  it('keeps whole bound kinds or re-forms ordinary singleton replacements without hiding endpoint failures',async()=>{
    const s=await selectorSetup(),minimum=(value:string):RawScalarFacetComponent=>({facets:[s.facet('minInclusive',value)]});
    const {kernel}=s.candidate([
      s.raw('BoundAnchor',builtin('decimal'),[minimum('1'),minimum('2'),s.entry('enumeration','2')]),
      s.raw('WholeBound',named('BoundAnchor'),[{baseComponent:0},{baseComponent:1},{baseComponent:2}]),
      s.raw('PartialBound',named('BoundAnchor'),[{baseComponent:1},{baseComponent:2}]),
      s.raw('ReplaceBound',named('BoundAnchor'),[s.entry('minInclusive','2'),{baseComponent:2}]),
      s.raw('BadReplacement',named('BoundAnchor'),[s.entry('minInclusive','3'),{baseComponent:2}]),
      s.raw('BadMixed',named('BoundAnchor'),[{baseComponent:1},s.entry('minInclusive','3'),{baseComponent:2}]),
    ]);
    for(const name of ['BoundAnchor','WholeBound','ReplaceBound'])expect(kernel.describe(named(name),id(name))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.describe(named('PartialBound'),id('PartialBound'))).toMatchObject({kind:'checked',
      obligations:[{rule:'raw-simple-facet-restriction-validity',component:id('PartialBound')}]});
    for(const name of ['BadReplacement','BadMixed'])expect(kernel.describe(named(name),id(name))).toMatchObject({kind:'invalid-schema',rule:'minInclusive-value'});
  });

  it('preserves fixed/cross-kind duties and supports nonbound common-fixed selection with disjoint dead patterns',async()=>{
    const s=await selectorSetup();
    const {kernel}=s.candidate([
      s.raw('FixedAnchor',builtin('decimal'),[s.entry('minInclusive','1',true),s.entry('minInclusive','0'),s.entry('enumeration','1')]),
      s.raw('FixedCopy',named('FixedAnchor'),[{baseComponent:0},{baseComponent:1},{baseComponent:2}]),
      s.raw('UpperBase',builtin('decimal'),[s.entry('maxExclusive','1')]),
      s.raw('UpperAnchor',named('UpperBase'),[s.entry('maxExclusive','1'),s.entry('maxInclusive','0')]),
      s.raw('UpperCopy',named('UpperAnchor'),[{baseComponent:0},{baseComponent:1}]),
      s.raw('WhitespaceAnchor',builtin('string'),[s.entry('whiteSpace','replace',true),s.entry('whiteSpace','collapse')]),
      s.raw('WhitespaceSubset',named('WhitespaceAnchor'),[{baseComponent:0},s.entry('pattern','a'),s.entry('pattern','b')]),
    ]);
    for(const name of ['FixedAnchor','UpperAnchor','WhitespaceAnchor','WhitespaceSubset'])
      expect(kernel.describe(named(name),id(name))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.describe(named('FixedCopy'),id('FixedCopy'))).toMatchObject({kind:'invalid-schema',rule:'facet-fixed'});
    expect(kernel.describe(named('UpperCopy'),id('UpperCopy'))).toMatchObject({kind:'invalid-schema',rule:'maxExclusive-valid-restriction'});
  });

  it('retains unknown pattern occurrences and isolates base membership and cache failure facts',async()=>{
    const s=await selectorSetup(),pattern={facets:[s.facet('pattern','a')]};
    const {context,kernel}=s.candidate([
      s.raw('PatternAnchor',builtin('string'),[pattern,{facets:pattern.facets}]),
      s.raw('PeerPatternAnchor',builtin('string'),[pattern,{facets:pattern.facets}]),
      s.raw('PatternCopy',named('PatternAnchor'),[{baseComponent:0},{baseComponent:1}]),
      s.raw('PeerPatternCopy',named('PeerPatternAnchor'),[{baseComponent:0},{baseComponent:1}]),
      s.raw('PatternDead',named('PatternAnchor'),[{baseComponent:0},{baseComponent:1},s.entry('pattern','b'),s.entry('pattern','c')]),
    ]);
    expect(kernel.describe(named('PatternDead'),id('PatternDead'))).toMatchObject({kind:'checked',obligations:[]});
    expect(compareSchemaFacetProperties(context,named('PatternAnchor'),id('PatternAnchor'),context,named('PatternCopy'),id('PatternCopy')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(compareSchemaFacetProperties(context,named('PatternCopy'),id('PatternCopy'),context,named('PeerPatternCopy'),id('PeerPatternCopy')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'unresolved',obligations:[]});
    expect(kernel.assess(named('PatternCopy'),{value:'a',context:s.seed.context},id('PatternCopy'))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.assess(named('PatternCopy'),{value:'b',context:s.seed.context},id('PatternCopy'))).toMatchObject({kind:'invalid-schema'});
    s.request.budget.guard(()=>s.request.budget.chargeWork(100_000_000));
    expect(kernel.describe(named('PatternCopy'),id('PatternCopy'))).toBe(s.request.budget.failure());
  });

  it('does not invent ordinal tables for source or legacy descriptions',async()=>{
    const s=await selectorSetup(),legacyExact=s.raw('LegacyBase',builtin('decimal'),[s.entry('minInclusive','0')]);
    const {facetComponentSet:components,...properties}=legacyExact;
    const legacy:RawSimpleTypeProperties & {base:Reference}={...properties,facetLayers:components.map(entry=>{
      if(!('facets' in entry))throw new Error('Expected literal legacy recipe');return {facets:entry.facets};
    })};
    const {kernel}=s.candidate([legacy,s.raw('LegacyBorrower',named('LegacyBase'),[{baseComponent:0}]),
      s.raw('SourceBorrower',named('Empty'),[{baseComponent:0}])]);
    expect(kernel.describe(named('LegacyBase'),id('LegacyBase'))).toMatchObject({kind:'checked',obligations:[]});
    for(const name of ['LegacyBorrower','SourceBorrower'])expect(kernel.describe(named(name),id(name)))
      .toMatchObject({kind:'unresolved',rule:'raw-simple-facet-restriction-validity'});
  });

  it('qualifies changed derived constituents after ordinary formation and preserves literal baselines',async()=>{
    const s=await selectorSetup(),ur=builtin('anySimpleType'),string=builtin('string');
    const list={kind:'list' as const,item:named('Item')},members=[string,builtin('int')];
    const {kernel}=s.candidate([
      s.raw('Item',string,[]),s.raw('ItemChild',named('Item'),[]),
      s.raw('ListBase',ur,[s.entry('whiteSpace','collapse',true)],list),
      s.raw('ListSame',named('ListBase'),[{baseComponent:0}],list),
      s.raw('ListChanged',named('ListBase'),[{baseComponent:0}],{kind:'list',item:named('ItemChild')}),
      s.raw('ListLiteralChanged',named('ListBase'),[s.entry('whiteSpace','collapse',true)],{kind:'list',item:named('ItemChild')}),
      s.raw('ListChangedBadWhitespace',named('ListBase'),[{baseComponent:0},s.entry('whiteSpace','replace')],{kind:'list',item:named('ItemChild')}),
      s.raw('ListNotDerived',named('ListBase'),[{baseComponent:0}],{kind:'list',item:builtin('decimal')}),
      s.raw('UnionBare',ur,[],{kind:'union',members}),
      s.raw('UnionBase',named('UnionBare'),[s.entry('pattern','a')],{kind:'union',members}),
      s.raw('UnionSame',named('UnionBase'),[{baseComponent:0}],{kind:'union',members}),
      s.raw('UnionChanged',named('UnionBase'),[{baseComponent:0}],{kind:'union',members:[named('ItemChild'),builtin('int')]}),
      s.raw('UnionLiteralChanged',named('UnionBase'),[s.entry('pattern','a')],{kind:'union',members:[named('ItemChild'),builtin('int')]}),
      s.raw('UnionNotDerived',named('UnionBase'),[{baseComponent:0}],{kind:'union',members:[builtin('decimal'),builtin('int')]}),
    ]);
    for(const name of ['ListBase','ListSame','ListLiteralChanged','UnionBase','UnionSame','UnionLiteralChanged'])
      expect(kernel.describe(named(name),id(name))).toMatchObject({kind:'checked',obligations:[]});
    for(const name of ['ListChanged','UnionChanged'])expect(kernel.describe(named(name),id(name)))
      .toMatchObject({kind:'checked',obligations:[{rule:'raw-simple-facet-restriction-validity',component:id(name)}]});
    expect(kernel.describe(named('ListChangedBadWhitespace'),id('ListChangedBadWhitespace'))).toMatchObject({kind:'invalid-schema',rule:'whiteSpace-valid-restriction'});
    for(const name of ['ListNotDerived','UnionNotDerived'])expect(kernel.describe(named(name),id(name))).toMatchObject({kind:'invalid-schema',rule:'cos-st-restricts'});
  });

  it('retains an integer-derived pattern only through the formed raw exact inventory',async()=>{
    const s=await selectorSetup(),{kernel}=s.candidate([
      s.raw('IntegerAnchor',builtin('integer'),[s.entry('whiteSpace','collapse',true),
        s.entry('fractionDigits','0',true),s.entry('pattern','[\\-+]?[0-9]+')]),
      s.raw('IntegerCopy',named('IntegerAnchor'),[{baseComponent:0},{baseComponent:1},{baseComponent:2}]),
    ]);
    for(const name of ['IntegerAnchor','IntegerCopy'])expect(kernel.describe(named(name),id(name))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.assess(named('IntegerCopy'),{value:'1',context:s.seed.context},id('IntegerCopy'))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.assess(named('IntegerCopy'),{value:'1.5',context:s.seed.context},id('IntegerCopy'))).toMatchObject({kind:'invalid-schema'});
  });

  it('keeps the existing whitespace prerequisite for a nonempty main pattern image',async()=>{
    const s=await originalSimpleSetup();
    const entry=(name:string,value:string,fixed=false):RawScalarFacetComponent=>{
      const {annotation:_annotation,...facet}=s.facet(name,value,fixed);return {facets:[facet],annotation:'absent'};
    };
    const replace=entry('whiteSpace','replace',true);
    const context=s.overlay([exact(s.raw('Empty'),[replace,entry('whiteSpace','collapse')]),
      exact(s.raw('PeerEmpty',[],{base:named('Empty')}),[replace,entry('pattern','a')])]);
    const kernel=createSchemaScalarKernel(context);
    expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.assess(named('PeerEmpty'),{value:'a',context:s.seed.context},id('PeerEmpty')))
      .toMatchObject({kind:'checked',obligations:[{rule:'raw-simple-facet-restriction-validity',component:id('PeerEmpty')}]});
  });

  it('takes alternatives within one main pattern component as a union',async()=>{
    const s=await originalSimpleSetup();
    const facet=(name:string,value:string)=>{const {annotation:_annotation,...result}=s.facet(name,value);return result;};
    const minimum=(value:string):RawScalarFacetComponent=>({facets:[facet('minLength',value)],annotation:'absent'});
    const alternatives:RawScalarFacetComponent={facets:[facet('pattern','aa'),facet('pattern','bbb')],annotation:'absent'};
    const context=s.overlay([
      exact(s.raw('Empty'),[minimum('2'),minimum('3')]),
      exact(s.raw('PeerEmpty',[],{base:named('Empty')}),[minimum('2'),alternatives]),
    ]);
    // The main component admits aa, so the result is not contained in min3.
    expect(createSchemaScalarKernel(context).describe(named('PeerEmpty'),id('PeerEmpty')))
      .toMatchObject({kind:'invalid-schema',rule:'scalar-value-space-restriction'});
  });

  it('does not intersect the independent patterns of a list item union',async()=>{
    const s=await originalSimpleSetup();
    const facet=(name:string,value:string,fixed=false)=>{const {annotation:_annotation,...result}=s.facet(name,value,fixed);return result;};
    const entry=(name:string,value:string,fixed=false):RawScalarFacetComponent=>({facets:[facet(name,value,fixed)],annotation:'absent'});
    const names=['ItemA','ItemB','ItemUnion','ListBare','ListBase','ListResult','ListWitness'] as const;
    const node=(name:typeof names[number],base:ReturnType<typeof builtin>):SimpleTypeNode=>({...s.seed,id:id(name),
      identity:{kind:'global',role:'type',name:{namespace:s.seed.identity.kind==='global'?s.seed.identity.name.namespace:'',local:name}},
      variety:{kind:'restriction',base,facets:[]}});
    const row=(name:typeof names[number],base:ReturnType<typeof builtin>,variety:RawSimpleTypeProperties['variety'],
      facetComponentSet:readonly RawScalarFacetComponent[]):RawSimpleTypeProperties & {base:ReturnType<typeof builtin>}=>({type:id(name),base,variety,final:[],
      facetComponentSet,provenance:{kind:'hypothetical-abstract',originals:[]}});
    const string=builtin('string'),ur=builtin('anySimpleType'),members=[named('ItemA'),named('ItemB')];
    const list={kind:'list' as const,item:named('ItemUnion')},whitespace=entry('whiteSpace','collapse',true);
    const rows=[row('ItemA',string,{kind:'atomic'},[entry('pattern','a')]),
      row('ItemB',string,{kind:'atomic'},[entry('pattern','b')]),
      row('ItemUnion',ur,{kind:'union',members},[]),
      row('ListBare',ur,list,[whitespace]),
      row('ListBase',named('ListBare'),list,[whitespace,entry('minLength','1'),entry('minLength','2')]),
      row('ListResult',named('ListBase'),list,[whitespace,entry('minLength','1')]),
      row('ListWitness',named('ListBare'),list,[whitespace,entry('minLength','1')])];
    const context=s.candidate(rows,rows.map((value,index)=>node(names[index],value.base))),kernel=createSchemaScalarKernel(context);
    for(const value of ['a','b']){
      const assessed=kernel.assess(named('ListWitness'),{value,context:s.seed.context},id('ListWitness'));
      expect(assessed,JSON.stringify(assessed)).toMatchObject({kind:'checked',obligations:[]});
    }
    expect(kernel.describe(named('ListBase'),id('ListBase'))).toMatchObject({kind:'checked',obligations:[]});
    // a and b are alternative item values, not contradictory main predicates.
    expect(kernel.describe(named('ListResult'),id('ListResult')))
      .toMatchObject({kind:'invalid-schema',rule:'scalar-value-space-restriction'});
  });

  it('retains enum introduction ambiguity despite an empty main pattern intersection',async()=>{
    const s=await originalSimpleSetup();
    const facet=(name:string,value:string,fixed=false)=>{const {annotation:_annotation,...result}=s.facet(name,value,fixed);return result;};
    const entry=(name:string,value:string,fixed=false):RawScalarFacetComponent=>({facets:[facet(name,value,fixed)],annotation:'absent'});
    const replace=entry('whiteSpace','replace',true),enumeration=[facet('enumeration','a'),facet('enumeration','a  b')];
    const context=s.overlay([
      exact(s.raw('Empty'),[replace,entry('whiteSpace','collapse'),{facets:enumeration,annotation:annotation('base')}]),
      exact(s.raw('PeerEmpty',[],{base:named('Empty')}),[replace,{facets:enumeration},entry('pattern','a'),entry('pattern','b')]),
    ]),kernel=createSchemaScalarKernel(context);
    expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.assess(named('Empty'),{value:'a  b',context:s.seed.context},id('Empty'))).toMatchObject({kind:'invalid-schema'});
    expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toMatchObject({kind:'checked',
      obligations:[{rule:'raw-simple-facet-restriction-validity',component:id('PeerEmpty')}]});
  });

  it('returns an unresolved local-bound prerequisite rather than clearing it with empty patterns',async()=>{
    const s=await originalSimpleSetup();
    const facet=(name:string,value:string):ScalarFacet=>{
      const {annotation:_annotation,...result}=s.facet(name,value);
      return ['enumeration','minInclusive'].includes(name)?{...result,operand:{type:builtin('decimal'),owner:id('D'),context:'active'}}:result;
    };
    const entry=(name:string,value:string):RawScalarFacetComponent=>({facets:[facet(name,value)],annotation:'absent'});
    const minimum:RawScalarFacetComponent={facets:[facet('minInclusive','0')]},enumeration=entry('enumeration','1');
    const context=s.overlay([
      exact(s.raw('Empty',[],{base:builtin('decimal')}),[minimum,enumeration,entry('totalDigits','1'),entry('totalDigits','2')]),
      exact(s.raw('PeerEmpty',[],{base:named('Empty')}),[minimum,enumeration,entry('totalDigits','2'),entry('pattern','a'),entry('pattern','b')]),
    ]),kernel=createSchemaScalarKernel(context);
    expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
    // The result's digits2 does not cover inherited digits1. Empty main
    // patterns prove containment, but unknown min0 retention remains live:
    // its alternative new endpoint0 is outside the base enumeration{1}.
    expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toMatchObject({kind:'checked',
      obligations:[{rule:'raw-simple-facet-restriction-validity',component:id('PeerEmpty')}]});
  });

  it.each(['enum','omission','endpoint'] as const)('keeps the %s formation duty with contradictory main patterns',async mode=>{
    const s=await originalSimpleSetup();
    const facet=(name:string,value:string):ScalarFacet=>{
      const {annotation:_annotation,...result}=s.facet(name,value);
      return ['enumeration','minInclusive'].includes(name)?{...result,operand:{type:builtin('decimal'),owner:id('D'),context:'active'}}:result;
    };
    const entry=(name:string,value:string,evidence:FacetAnnotation='absent'):RawScalarFacetComponent=>({facets:[facet(name,value)],annotation:evidence});
    const dead=[entry('pattern','a'),entry('pattern','b')];
    const base=mode==='omission'?builtin('string'):builtin('decimal');
    const prior=mode==='omission'?[entry('minLength','2'),entry('minLength','3'),entry('pattern','aaa')]
      :[entry('minInclusive','2'),{facets:[facet('enumeration','1'),facet('enumeration','2')],annotation:annotation('base')}];
    const supplied=mode==='omission'?[entry('minLength','2'),...dead]
      :mode==='endpoint'?[entry('minInclusive','3'),prior[1],...dead]
        :[entry('minInclusive','2'),{facets:[facet('enumeration','1'),facet('enumeration','2')],annotation:'absent' as const},...dead];
    const context=s.overlay([exact(s.raw('Empty',[],{base}),prior),exact(s.raw('PeerEmpty',[],{base:named('Empty')}),supplied)]);
    const kernel=createSchemaScalarKernel(context);
    expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toMatchObject({kind:'invalid-schema',
      rule:mode==='enum'?'enumeration-valid-restriction':mode==='omission'?'st-restrict-facets':'minInclusive-value'});
  });

  it.each(['legacy','exact'] as const)('ignores caller group identities when comparing distinct %s pattern properties',async representation=>{
    const s=await originalSimpleSetup(),identity={caller:'not-issued'};
    const raw=(type:string,value:string)=>{
      const {annotation:_annotation,...facet}=s.facet('pattern',value);
      const group={facets:[facet],annotation:'absent' as const,identity};
      return representation==='exact'?exact(s.raw(type),[group]):{...s.raw(type),facetLayers:[group]};
    };
    const context=s.overlay([raw('Empty','a'),raw('PeerEmpty','b')]);
    expect(compareSchemaFacetProperties(context,named('Empty'),id('Empty'),context,named('PeerEmpty'),id('PeerEmpty')))
      .toMatchObject({kind:'checked',value:false});
  });

  it.each(['legacy','exact'] as const)('does not let extra %s group identities settle unknown enum retention',async representation=>{
    for(const identity of [{caller:'not-issued'},'not-an-issued-object']){
      const s=await originalSimpleSetup();
      const decimal=(name:string,value:string):ScalarFacet=>({name,fixed:false,lexical:{value,context:s.seed.context},
        operand:{type:builtin('decimal'),owner:id('D'),context:'active'}});
      const minimum={facets:[{...decimal('minInclusive','2'),annotation:'absent' as const}]};
      const enumeration={facets:[decimal('enumeration','1'),decimal('enumeration','2')],identity};
      const raw=(type:string,base:ReturnType<typeof builtin>):RawSimpleTypeProperties=>representation==='exact'
        ?exact(s.raw(type,[],{base}),[{facets:[decimal('minInclusive','2')],annotation:'absent'},enumeration])
        :{...s.raw(type,[],{base}),facetLayers:[minimum,enumeration]};
      const context=s.overlay([raw('Empty',builtin('decimal')),raw('PeerEmpty',named('Empty'))]);
      const kernel=createSchemaScalarKernel(context);
      expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
      expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toMatchObject({kind:'checked',
        obligations:[{rule:'raw-simple-facet-restriction-validity',component:id('PeerEmpty')}]});
      expect(kernel.assess(named('PeerEmpty'),{value:'2',context:s.seed.context},id('PeerEmpty')))
        .toMatchObject({kind:'checked',obligations:[{rule:'raw-simple-facet-restriction-validity',component:id('PeerEmpty')}]});
    }
  });

  it.each(['legacy','exact'] as const)('rejects changed %s enum values despite shared caller identity',async representation=>{
    const s=await originalSimpleSetup(),identity={caller:'not-issued'};
    const raw=(type:string,base:ReturnType<typeof builtin>,value:string):RawSimpleTypeProperties=>{
      const facet:ScalarFacet={name:'enumeration',fixed:false,lexical:{value,context:s.seed.context},
        operand:{type:builtin('decimal'),owner:id('D'),context:'active'}};
      const group={facets:[facet],annotation:'absent' as const,identity};
      return representation==='exact'?exact(s.raw(type,[],{base}),[group]):{...s.raw(type,[],{base}),facetLayers:[group]};
    };
    const context=s.overlay([raw('Empty',builtin('decimal'),'1'),raw('PeerEmpty',named('Empty'),'2')]);
    expect(createSchemaScalarKernel(context).describe(named('PeerEmpty'),id('PeerEmpty')))
      .toMatchObject({kind:'invalid-schema',rule:'st-restrict-facets'});
  });

  it.each(['1','2'])('proves new enum membership or retains unknown introduction qualification at minInclusive %s',async minimum=>{
    const s=await originalSimpleSetup();
    const decimal=(name:string,value:string):ScalarFacet=>{
      const {annotation:_annotation,...facet}=s.facet(name,value);
      return {...facet,operand:{type:builtin('decimal'),owner:id('D'),context:'active'}};
    };
    const bound:RawScalarFacetComponent={facets:[decimal('minInclusive',minimum)],annotation:'absent'};
    const values=[decimal('enumeration','1'),decimal('enumeration','2')];
    const parent=exact(s.raw('Empty',[],{base:builtin('decimal')}),[bound,{facets:values,annotation:annotation('retained')}]);
    const supplied=exact(s.raw('PeerEmpty',[],{base:named('Empty')}),[bound,{facets:values}]);
    const context=s.overlay([parent,supplied]),kernel=createSchemaScalarKernel(context);
    expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
    const obligations=minimum==='1'?[]:[{rule:'raw-simple-facet-restriction-validity',component:id('PeerEmpty')}];
    expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toMatchObject({kind:'checked',obligations,
      typeDependencies:expect.arrayContaining([
        {contextId:context.contextId,type:{kind:'component',id:id('Empty')}},
        {contextId:context.contextId,type:{kind:'builtin',name:{namespace:xsd,local:'decimal'}}},
      ])});
    expect(kernel.assess(named('PeerEmpty'),{value:'2',context:s.seed.context},id('PeerEmpty')))
      .toMatchObject({kind:'checked',obligations});
    expect(compareSchemaFacetProperties(context,named('Empty'),id('Empty'),context,named('PeerEmpty'),id('PeerEmpty')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'unresolved'});
    s.request.budget.guard(()=>s.request.budget.chargeWork(DEFAULT_MAX_WORK));
    expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toBe(s.request.budget.failure());
  });

  it('does not hide an invalid typed enum operand behind ambiguous retention',async()=>{
    const s=await originalSimpleSetup();
    const scalar=(name:string,base:ReturnType<typeof builtin>,operand:ReturnType<typeof builtin>)=>
      exact(s.raw(name,[],{base}),[{facets:[{name:'enumeration',fixed:false,
        lexical:{value:'1',context:s.seed.context},operand:{type:operand,owner:id('D'),context:'active'}}]}]);
    const context=s.overlay([scalar('Empty',builtin('decimal'),builtin('decimal')),
      scalar('PeerEmpty',named('Empty'),builtin('string'))]);
    const kernel=createSchemaScalarKernel(context);
    expect(kernel.describe(named('Empty'),id('Empty'))).toMatchObject({kind:'checked',obligations:[]});
    expect(kernel.describe(named('PeerEmpty'),id('PeerEmpty'))).toMatchObject({kind:'invalid-schema',rule:'facet-value-type'});
  });

  it('identifies an inherited row without identifying shared caller groups or sibling births',async()=>{
    const s=await originalSimpleSetup(),{annotation:_annotation,...facet}=s.facet('minLength','1');
    const group:RawScalarFacetComponent={facets:[facet]};
    const leftRow=exact(s.raw('Empty'),[group]),rightRow=exact(s.raw('PeerEmpty'),[group]);
    const parent=s.overlay([leftRow,rightRow],'shared-unknown-component-data');
    const fork=forkSemanticCandidate(parent,{key:'same-inherited-rows',active:parent.members});
    expect(fork.kind).toBe('prepared');if(fork.kind!=='prepared')throw new Error('Expected inherited context');
    expect(compareSchemaFacetProperties(parent,named('Empty'),id('Empty'),fork.context,named('Empty'),id('Empty')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',
        sourceFacetAnnotations:{left:'unresolved',right:'unresolved'},obligations:[]});
    expect(compareSchemaFacetProperties(parent,named('Empty'),id('Empty'),parent,named('PeerEmpty'),id('PeerEmpty')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'unresolved',obligations:[]});
    const sibling=s.overlay([leftRow],'separate-first-birth-same-type-id');
    expect(compareSchemaFacetProperties(parent,named('Empty'),id('Empty'),sibling,named('Empty'),id('Empty')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'unresolved',obligations:[]});
    expect(fork.context.rawSimpleTypeProperties(id('Empty'))).toEqual(parent.rawSimpleTypeProperties(id('Empty')));
  });

  it('preserves repeated incidences and immutable pattern values without equating a subset row',async()=>{
    const s=await originalSimpleSetup(),pattern=(value:string):RawScalarFacetComponent=>{
      const {annotation:_annotation,...facet}=s.facet('pattern',value);return {facets:[facet]};
    };
    const shared=pattern('a'),other=pattern('b');
    const parent=s.overlay([exact(s.raw('Empty'),[shared,shared,other]),exact(s.raw('PeerEmpty'),[shared])],'repeated-component-incidences');
    const fork=forkSemanticCandidate(parent,{key:'inherited-repeated-components',active:parent.members});
    expect(fork.kind).toBe('prepared');if(fork.kind!=='prepared')throw new Error('Expected inherited pattern row');
    expect(compareSchemaFacetProperties(parent,named('Empty'),id('Empty'),fork.context,named('Empty'),id('Empty')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]});
    expect(compareSchemaFacetProperties(parent,named('Empty'),id('Empty'),parent,named('PeerEmpty'),id('PeerEmpty')))
      .toMatchObject({kind:'checked',value:false});
    expect(compareSchemaFacetProperties(parent,named('PeerEmpty'),id('PeerEmpty'),parent,named('Empty'),id('Empty')))
      .toMatchObject({kind:'checked',value:false});
  });

  it('reassesses active typed operands and retains their H formation duties despite inherited identity',async()=>{
    const s=await originalSimpleSetup(),d=s.complex('D');
    const node:SimpleTypeNode={...s.seed,id:id('ActiveEnum'),identity:{kind:'global',role:'type',
      name:{namespace:s.seed.context.effectiveNamespace,local:'ActiveEnum'}}};
    const {annotation:_annotation,...facet}=s.facet('enumeration','1');
    const row=exact({...s.raw('Empty'),type:node.id},[{facets:[{...facet,
      operand:{type:named('D'),owner:d.id,context:'active'}}]}]);
    const alias:SimpleTypeNode={...node,id:id('ActiveEnumAlias'),identity:{kind:'global',role:'type',
      name:{namespace:s.seed.context.effectiveNamespace,local:'ActiveEnumAlias'}},
      variety:{kind:'restriction',base:{kind:'local',target:node.id},facets:[]}};
    const aliasRow:RawSimpleTypeProperties={type:alias.id,base:{kind:'local',target:node.id},final:[],
      variety:{kind:'atomic'},facetComponentSet:[{baseComponent:0}],provenance:{kind:'hypothetical-abstract',originals:[]}};
    const properties=(type:'string'|'decimal'):RawComplexTypeProperties=>({type:d.id,
      derivation:{method:'extension',base:builtin(type)},content:{kind:'simple',type:builtin(type)},
      abstract:false,final:[],block:[],attributeUses:[],provenance:{kind:'hypothetical-abstract',originals:[d.id]}});
    // Structural contexts isolate the value reader; changed D is not claimed to correspond to the source.
    const parent=s.request.candidate({key:'active-enum-string',active:[...s.request.actual.members,node.id,alias.id],
      additions:[node,alias],rawSimpleTypes:[row,aliasRow],rawTypes:[properties('string')]});
    expect(parent.kind).toBe('prepared');if(parent.kind!=='prepared')throw new Error('Expected active operand parent');
    const child=forkSemanticCandidate(parent.context,{key:'active-enum-decimal',active:parent.context.members,
      endpoint:d,rawTypes:[properties('decimal')]});
    expect(child.kind).toBe('prepared');if(child.kind!=='prepared')throw new Error('Expected changed active operand');
    const before=createSchemaScalarKernel(parent.context).describe({kind:'local',target:node.id},node.id);
    expect(before).toMatchObject({kind:'checked',obligations:expect.arrayContaining([
      {rule:'raw-simple-content-derivation-validity',component:d.id}])});
    if(before.kind!=='checked')throw new Error('Expected conditional scalar formation');
    expect(before.typeDependencies).toEqual(expect.arrayContaining([
      {contextId:parent.context.contextId,type:{kind:'component',id:node.id}},
      {contextId:parent.context.contextId,type:{kind:'builtin',name:{namespace:xsd,local:'string'}}},
    ]));
    expect(createSchemaScalarKernel(parent.context).describe({kind:'local',target:alias.id},alias.id))
      .toMatchObject({kind:'checked',obligations:expect.arrayContaining([{rule:'raw-simple-content-derivation-validity',component:d.id}])});
    const compared=compareSchemaFacetProperties(parent.context,{kind:'local',target:node.id},node.id,
      child.context,{kind:'local',target:node.id},node.id);
    expect(compared).toMatchObject({kind:'invalid-schema',rule:'facet-value-type',side:'right',contextId:child.context.contextId,
      obligations:expect.arrayContaining([{rule:'raw-simple-content-derivation-validity',component:d.id,
        contextId:parent.context.contextId}])});
    expect(createSchemaScalarKernel(child.context).describe({kind:'local',target:node.id},node.id))
      .toMatchObject({kind:'invalid-schema',rule:'facet-value-type'});
    expect(createSchemaScalarKernel(child.context).describe({kind:'local',target:alias.id},alias.id))
      .toMatchObject({kind:'invalid-schema',rule:'facet-value-type'});
  });

  // Independently reproduced in the PR #282 source review: JavaScript object
  // sharing and unrelated scalar evaluation must not change typed equality.
  it.each(['minInclusive','enumeration'] as const)('keeps shared %s values in their own scalar domains in either evaluation order',async name=>{
    for (const share of [true,false]) for (const decimalFirst of [true,false]) {
      const s=await originalSimpleSetup(undefined,createSemanticBudget(),'https://facet-recovery.example/shared-facet.xsd');
      const {annotation:_annotation,...shared}=s.facet(name,'2024');
      const raw=(type:string,primitive:string,facet:ScalarFacet)=>exact(s.raw(type,[],{base:builtin(primitive)}),
        [{facets:[facet],annotation:'absent'}]);
      const context=s.overlay([
        raw('Empty','gYear',shared), raw('PeerEmpty','gYear',{...shared}),
        raw('DecimalOne','decimal',share?shared:{...shared}),
      ],`shared-${name}-${share}-${decimalFirst}`);
      const compare=(left:string,right:string)=>compareSchemaFacetProperties(context,named(left),id(left),context,named(right),id(right));
      const equal={kind:'checked',value:true,annotationCorrespondence:'equal',obligations:[]};
      const different={kind:'checked',value:false,annotationCorrespondence:'different',obligations:[]};
      if (decimalFirst) expect(compare('DecimalOne','DecimalOne')).toMatchObject(equal);
      expect(compare('Empty','PeerEmpty')).toMatchObject(equal);
      expect(compare('DecimalOne','DecimalOne')).toMatchObject(equal);
      expect(compare('Empty','PeerEmpty')).toMatchObject(equal);
      expect(compare('Empty','DecimalOne')).toMatchObject(different);
      expect(compare('DecimalOne','Empty')).toMatchObject(different);
      expect(compare('PeerEmpty','Empty')).toMatchObject(equal);
      expect(compare('DecimalOne','DecimalOne')).toMatchObject(equal);
      s.request.budget.guard(()=>s.request.budget.chargeWork(DEFAULT_MAX_WORK));
      expect(compare('Empty','PeerEmpty')).toBe(s.request.budget.failure());
      expect(s.request.budget.usage().work).toBeLessThanOrEqual(DEFAULT_MAX_WORK);
    }
  });

  it.each(['facetLayers','facetComponentSet'] as const)('preserves inherited %s enumeration membership after another domain uses the same facet',async representation=>{
    const s=await originalSimpleSetup(undefined,createSemanticBudget(),'https://facet-recovery.example/inherited-shared-enumeration.xsd');
    const {annotation:_annotation,...shared}=s.facet('enumeration','2024');
    const raw=(type:string,primitive:string)=>representation==='facetLayers'
      ? s.raw(type,[shared],{base:builtin(primitive)})
      : exact(s.raw(type,[],{base:builtin(primitive)}),[{facets:[shared],annotation:'absent'}]);
    const context=s.overlay([raw('AnnotatedMultiEnum','gYear'),raw('DecimalOne','decimal')],`inherited-${representation}`);
    const kernel=createSchemaScalarKernel(context);
    const assess=(type:string,value:string)=>kernel.assess(named(type),{value,context:s.seed.context},id(type));
    // The source child has no new enumeration: its original installed parent
    // layer must keep its gYear values, including for newly supplied lexicals.
    expect(assess('InheritedAnnotatedMultiEnum','2024')).toMatchObject({kind:'checked',value:{operand:{family:'gYear'}},obligations:[]});
    expect(assess('DecimalOne','2024')).toMatchObject({kind:'checked',value:{operand:{family:'decimal'}},obligations:[]});
    expect(assess('InheritedAnnotatedMultiEnum','2024')).toMatchObject({kind:'checked',value:{operand:{family:'gYear'}},obligations:[]});
    expect(assess('InheritedAnnotatedMultiEnum','2025')).toMatchObject({kind:'invalid-schema',rule:'cvc-enumeration-valid'});
    expect(assess('DecimalOne','2024')).toMatchObject({kind:'checked',value:{operand:{family:'decimal'}},obligations:[]});
  });

  it('uses complete independent annotation content through candidate and finite consumers',async()=>{
    const s=await originalSimpleSetup(undefined,undefined,'https://facet-recovery.example/original.xsd');
    const source=s.facet('minLength','1'),candidateUri='https://facet-candidate.example/raw.xsd';
    const supplied={...source,lexical:{...source.lexical,context:{...source.lexical.context,
      baseUri:candidateUri,source:{...source.lexical.context.source,uri:candidateUri,digest:'0'.repeat(64),path:'/supplied'}}}};
    const context=s.candidate([exact(s.raw('Annotated'),[component(supplied,annotation('Retained original facet annotation.'))])]);
    expect(s.correspondence(context)).toMatchObject({kind:'checked'});
    expect(s.finite(context)).toMatchObject({kind:'checked-candidate'});
    const changed=s.candidate([exact(s.raw('Annotated'),[component(supplied,annotation('Different documentation.'))])]);
    expect(s.correspondence(changed)).toMatchObject({kind:'candidate-rejected',rule:'original-facet-annotation-correspondence'});
    const {annotation:_payload,...missing}=supplied;
    const omitted=s.candidate([exact(s.raw('Annotated'),[component(missing)])]);
    expect(s.correspondence(omitted)).toMatchObject({kind:'unresolved',rule:'original-facet-annotation-correspondence'});
    const absent=s.candidate([exact(s.raw('Annotated'),[component(missing,'absent')])]);
    expect(s.correspondence(absent)).toMatchObject({kind:'candidate-rejected',rule:'original-facet-annotation-correspondence'});
  });

  it('retains distinct fixed tuples and source scalar replacement under F2',async()=>{
    const s=await originalSimpleSetup();
    const a=exact(s.raw('MinOne'),[component(s.facet('minLength','3')),component(s.facet('minLength','3',true))]);
    const b=exact(s.raw('MinOne'),[component(s.facet('minLength','3')),component(s.facet('minLength','3'))]);
    const left=s.overlay([a],'exact-fixed-left'),right=s.overlay([b],'exact-fixed-right');
    expect(compareSchemaFacetProperties(left,named('MinOne'),id('MinOne'),right,named('MinOne'),id('MinOne')))
      .toMatchObject({kind:'checked',value:false});
    const replaced=exact(s.raw('ReplacedAnnotation',[],{base:named('Annotated')}),[component(s.facet('minLength','2'))]);
    const result=compareSchemaFacetProperties(s.request.actual,named('ReplacedAnnotation'),id('ReplacedAnnotation'),
      s.overlay([replaced],'exact-replaced'),named('ReplacedAnnotation'),id('ReplacedAnnotation'));
    expect(result).toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
    const duplicate=s.overlay([exact(s.raw('MinOne'),[component(s.facet('minLength','3')),component(s.facet('minLength','3'))])],'exact-duplicate');
    const singleton=s.overlay([exact(s.raw('MinOne'),[component(s.facet('minLength','3'))])],'exact-singleton');
    expect(compareSchemaFacetProperties(duplicate,named('MinOne'),id('MinOne'),singleton,named('MinOne'),id('MinOne')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
    const duplicateFact=compareSchemaFacetProperties(duplicate,named('MinOne'),id('MinOne'),singleton,named('MinOne'),id('MinOne'));
    expect(duplicateFact).toMatchObject({kind:'checked',obligations:[]});
    const compared=compareSchemaFacetProperties(left,named('MinOne'),id('MinOne'),right,named('MinOne'),id('MinOne'));
    expect(compared).toMatchObject({kind:'checked',obligations:[]});
    expect(compareSchemaFacetProperties(s.request.actual,named('Annotated'),id('Annotated'),
      s.request.actual,named('ReplacedAnnotation'),id('ReplacedAnnotation')))
      .toMatchObject({kind:'checked',value:false,annotationCorrespondence:'different'});
  });

  it('compares documentation language, appinfo source and foreign markup payload',async()=>{
    const s=await originalSimpleSetup(),value=s.facet('minLength','1');
    const candidate=(payload:FacetAnnotation)=>s.candidate([exact(s.raw('RichAnnotation'),[component(value,payload)])]);
    expect(s.correspondence(candidate(richAnnotation()))).toMatchObject({kind:'checked'});
    for(const payload of [richAnnotation('fr'),richAnnotation('en','urn:recovery:other-appinfo'),
      richAnnotation('en','urn:recovery:facet-appinfo','Changed.')])
      expect(s.correspondence(candidate(payload))).toMatchObject({kind:'candidate-rejected',rule:'original-facet-annotation-correspondence'});
    const payload=richAnnotation();
    if(payload==='absent'||payload.content.kind!=='element')throw new Error('Expected complete annotation');
    const reordered:FacetAnnotation={kind:'present',content:{...payload.content,children:[...payload.content.children].reverse()}};
    expect(s.correspondence(candidate(reordered))).toMatchObject({kind:'unresolved',rule:'original-facet-annotation-correspondence'});
    const document=payload.content.children[0];
    if(document.kind!=='element')throw new Error('Expected documentation');
    const twoAttributes:FacetAnnotation={kind:'present',content:{...payload.content,children:[
      {...document,attributes:[...document.attributes,{name:{namespace:'',local:'source'},value:'urn:source'}]},
      payload.content.children[1]]}};
    const reversedAttributes:FacetAnnotation={kind:'present',content:{...payload.content,children:[
      {...document,attributes:[{name:{namespace:'',local:'source'},value:'urn:source'},...document.attributes]},
      payload.content.children[1]]}};
    expect(compareFacetAnnotation(twoAttributes,reversedAttributes,createSemanticBudget({maxWork:100_000}))).toBe('equal');
    const secondDocument={...document,children:[{kind:'text' as const,value:'Second documentation.'}]};
    const twoDocuments:FacetAnnotation={kind:'present',content:{...payload.content,children:[document,secondDocument]}};
    const swappedDocuments:FacetAnnotation={kind:'present',content:{...payload.content,children:[secondDocument,document]}};
    expect(compareFacetAnnotation(twoDocuments,twoDocuments,createSemanticBudget({maxWork:100_000}))).toBe('equal');
    expect(compareFacetAnnotation(twoDocuments,swappedDocuments,createSemanticBudget({maxWork:100_000}))).toBe('unresolved');
  });

  it('compares enumeration operands by typed value-set and patterns by selected P1',async()=>{
    const s=await originalSimpleSetup();
    const qname=(values:readonly string[])=>exact(s.raw('QNameOne',[],{base:builtin('QName')}),
      [{facets:values.map(value=>component(s.facet('enumeration',value)).facets[0]),annotation:'absent'}]);
    const left=s.overlay([qname(['p:Item','q:Item'])],'exact-qname-aliases');
    const right=s.overlay([qname(['q:Item'])],'exact-qname-single');
    expect(compareSchemaFacetProperties(left,named('QNameOne'),id('QNameOne'),right,named('QNameOne'),id('QNameOne')))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
    const multi=exact(s.raw('Multi'),[{facets:[component(s.facet('pattern','a')).facets[0],
      component(s.facet('pattern','b')).facets[0]],annotation:'absent'}]);
    expect(compareSchemaFacetProperties(s.request.actual,named('Multi'),id('Multi'),
      s.overlay([multi],'exact-multi-pattern'),named('Multi'),id('Multi')))
      .toMatchObject({kind:'checked',value:true,obligations:[]});
    const strict=(expression:string)=>exact(s.raw('Multi'),[component(s.facet('pattern',expression))]);
    expect(compareSchemaFacetProperties(s.overlay([strict('a  b')],'pattern-spaces-two'),named('Multi'),id('Multi'),
      s.overlay([strict('a b')],'pattern-spaces-one'),named('Multi'),id('Multi')))
      .toMatchObject({kind:'checked',value:false});
    for(const [original,inherited] of [
      ['AnnotatedMultiPattern','InheritedAnnotatedMultiPattern'],
      ['AnnotatedMultiEnum','InheritedAnnotatedMultiEnum']
    ] as const)
      expect(compareSchemaFacetProperties(s.request.actual,named(original),id(original),s.request.actual,named(inherited),id(inherited)))
        .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
  });

  it('keeps incomparable dateTime bounds in the exact supplied set',async()=>{
    const s=await originalSimpleSetup(),plain=component(s.facet('minInclusive','2001-01-01T00:00:00')),
      zoned=component(s.facet('minInclusive','2001-01-01T00:00:00Z'));
    const raw=(components:readonly RawScalarFacetComponent[])=>exact(s.raw('MinOne',[],{base:builtin('dateTime')}),components);
    const both=s.overlay([raw([plain,zoned])],'exact-date-both');
    const reversed=s.overlay([raw([zoned,plain])],'exact-date-reversed');
    const one=s.overlay([raw([plain])],'exact-date-one');
    expect(compareSchemaFacetProperties(both,named('MinOne'),id('MinOne'),reversed,named('MinOne'),id('MinOne')))
      .toMatchObject({kind:'checked',value:true});
    expect(compareSchemaFacetProperties(both,named('MinOne'),id('MinOne'),one,named('MinOne'),id('MinOne')))
      .toMatchObject({kind:'checked',value:false});
  });

  it('keeps incomplete and invalid annotation payloads out of exact equality',async()=>{
    const s=await originalSimpleSetup();
    const value=s.facet('minLength','1');
    const malformed={kind:'present',content:{kind:'element',name:{namespace:xsd,local:'annotation'},attributes:[],
      namespaces,children:[{kind:'text',value:42}]}};
    const rejected=s.request.candidate({key:'invalid-exact-annotation',active:s.request.actual.members,
      rawSimpleTypes:[exact(s.raw('Annotated'),[component(value,malformed as unknown as FacetAnnotation)])]});
    expect(rejected).toMatchObject({kind:'candidate-rejected',code:'representation'});
    let calls=0;
    const accessor={kind:'present',content:{kind:'element',name:{namespace:xsd,local:'annotation'},attributes:[],namespaces,
      get children(){calls++;return [];}}};
    expect(s.request.candidate({key:'exact-annotation-getter',active:s.request.actual.members,
      rawSimpleTypes:[exact(s.raw('Annotated'),[component(value,accessor as unknown as FacetAnnotation)])]}))
      .toMatchObject({kind:'candidate-rejected',code:'representation'});
    expect(calls).toBe(0);
    const budget=createSemanticBudget({maxWork:512});
    expect(budget.guard(()=>validateFacetAnnotation(annotation('x'.repeat(2048)),budget)))
      .toMatchObject({kind:'resource-limit',limit:'work'});
    expect(budget.usage().work).toBeLessThanOrEqual(512);
  });
});
