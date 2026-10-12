import {describe, expect, it} from 'vitest';
import {compareSchemaFacetProperties} from '../../src/compiler/schemaScalarKernel.js';
import {compareFacetAnnotation, validateFacetAnnotation} from '../../src/compiler/schemaFacetAnnotation.js';
import type {FacetAnnotation} from '../../src/compiler/schemaFacetAnnotation.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import type {RawScalarFacetComponent, RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';
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

describe('exact supplied facet component and annotation evidence',()=>{
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

  it('retains distinct fixed tuples and source scalar replacement without selecting F1/F2',async()=>{
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
    const pending=compareSchemaFacetProperties(left,named('MinOne'),id('MinOne'),right,named('MinOne'),id('MinOne'));
    expect(pending).toMatchObject({kind:'checked',obligations:expect.arrayContaining([
      expect.objectContaining({rule:'raw-simple-facet-restriction-validity',component:id('MinOne')})])});
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

  it('compares enumeration operands by typed value-set and keeps independent multi-pattern policy open',async()=>{
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
      .toMatchObject({kind:'unresolved',rule:'pattern-property-equality'});
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
