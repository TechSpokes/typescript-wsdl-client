import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping, createComponentDirectionalMapping, inspectComponentValueMapping} from '../../src/compiler/directValues.js';
import {encodeComponentXml, decodeComponentXml} from '../../src/compiler/directCodec.js';
import {lowerComponentShape} from '../../src/generation/componentShape.js';
import {parseApplicationGroups} from '../../src/compiler/applicationGroups.js';
import type {ApplicationGroupsOptions} from '../../src/compiler/applicationGroups.js';
import {applicationRecordName} from '../../src/compiler/applicationGroups.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';

const file = path.resolve('test/conformance/fixtures/assessment/application-groups.wsdl'), namespace = 'urn:checked:groups';
async function prepare(options: ApplicationGroupsOptions = {}, wsdl = file) {
  const selected = await selectComponentOperation(wsdl, {portType:{namespace,local:'PaymentPortType'},binding:{namespace,local:'PaymentBinding'},operation:'Submit'},
    {loading:{policy:{fileRoots:[path.dirname(wsdl)]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind+':'+selected.rule);
  const mapping = createComponentValueMapping(selected.contract,{kind:'input'},{},options);
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind+':'+mapping.rule);
  return {contract:selected.contract,mapping};
}
describe('source-owned application groups',()=>{
  it('reconstructs fresh repeated alternatives, nil and attributes in native XML order',async()=>{
    const {contract,mapping} = await prepare();
    const input = {id:'one',choice:'business field',$choice:[{B:{$nil:true},A:7},{D:'bank',C:true}]};
    const result = encodeComponentXml(contract,mapping,input);
    expect(result.kind).toBe('component-encoded');
    if (result.kind !== 'component-encoded') throw new Error(JSON.stringify(result));
    const xml = Buffer.from(result.bytes).toString();
    expect(xml.indexOf(':A>')).toBeLessThan(xml.indexOf(':B '));
    expect(xml).not.toContain('$choice');
    const decoded = decodeComponentXml(contract,mapping,result.bytes);
    expect(decoded.kind).toBe('component-decoded');
    if (decoded.kind==='component-decoded') expect(decoded.validated.value).toEqual(input);
    expect(input.$choice[0]!.B).toEqual({$nil:true});
    const shape = lowerComponentShape(contract,mapping,'Request',()=>{});
    expect(shape.declarations.join('\n')).toContain('PaymentChoiceChoiceAlternative1');
    expect(shape).toMatchSnapshot();
  });
  it('uses independently configured property, union and alternative names',async()=>{
    const initial = await prepare();
    const targets = inspectComponentValueMapping(initial.mapping,initial.contract).applicationGroups!.targets;
    const choice = targets.find(t=>t.defaults.typeName==='PaymentChoiceChoice')!, alternative = targets.find(t=>t.defaults.typeName==='PaymentChoiceChoiceAlternative1')!;
    const {contract,mapping} = await prepare({names:[{target:choice.target,propertyName:'$payment',typeName:'PaymentMethod'},{target:alternative.target,typeName:'CardPayment'}]});
    const result = encodeComponentXml(contract,mapping,{id:'x',$payment:[{A:1,B:'card'}]});
    expect(result.kind).toBe('component-encoded');
    if (result.kind==='component-encoded') {
      const decoded = decodeComponentXml(contract,mapping,result.bytes);
      if (decoded.kind!=='component-decoded') throw new Error(JSON.stringify(decoded));
      expect(decoded.validated.value).toEqual({id:'x',$payment:[{A:1,B:'card'}]});
    }
    for (const bad of [{id:'x',$choice:[{A:1,B:'card'}]}, {id:'x',$payment:[{A:1,B:'card'}],$choice:[]}]) expect(encodeComponentXml(contract,mapping,bad).kind).toBe('value-invalid');
    expect(lowerComponentShape(contract,mapping,'Request',()=>{}).declarations.join('\n')).toContain('export type PaymentMethod = CardPayment | PaymentChoiceChoiceAlternative2');
  });
  it.each([
    {id:'x',$choice:[]}, {id:'x',$choice:[{A:1}]}, {id:'x',$choice:[{A:1,B:'b',C:true,D:'d'}]},
    {id:'x',$choice:[{A:1,B:'b'},{A:2,B:'b'},{A:3,B:'b'},{A:4,B:'b'}]},
    {id:'x',$choice:[{A:'1',B:'b'}]}, {id:'x',$choice:[{C:'true',D:'d'}]},
  ])('rejects invalid fresh values without mutation',async(input)=>{
    const {contract,mapping}=await prepare(), before=JSON.stringify(input);
    expect(['value-invalid','scalar-invalid']).toContain(encodeComponentXml(contract,mapping,input).kind);
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each([null,false,{extra:true},{names:null},{names:[{target:'x'}]},{names:[{target:'x',propertyName:'$nil'}]},
    {names:[{target:'x',typeName:'class'}]},{names:[{target:'x',typeName:'bigint'}]},{names:[{target:'x',propertyName:'$bad-name'}]},
    {names:[{target:'x',typeName:'Good'},{target:'x',typeName:'Good'}]},
  ])('rejects malformed generation options',value=>expect(()=>parseApplicationGroups(value)).toThrow());
  it('executes nested, independent, reused and recursive definitions with exact occurrence bounds',async()=>{
    const {contract,mapping}=await prepare();
    const input={id:'nested',$choice:[{A:1,B:'b'}],nested:{$sequence:[{E:'first',$choice:{F:4}},{E:'second',$choice:{G:true}}]},
      multiple:{$choice:{H:'h'},$choice2:{J:false}},one:{$sequence:[{K:1,L:'one'},{K:2,L:'two'}]},two:{$sequence:[{K:3,L:'three'}]},
      tree:{$choice:{branch:{$choice:{branch:{$choice:{leaf:'end'}}}}}}};
    const encoded=encodeComponentXml(contract,mapping,input);
    if (encoded.kind!=='component-encoded') throw new Error(JSON.stringify(encoded));
    const decoded=decodeComponentXml(contract,mapping,encoded.bytes);
    if (decoded.kind!=='component-decoded') throw new Error(JSON.stringify(decoded));
    expect(decoded.validated.value).toEqual(input);
    const targets=inspectComponentValueMapping(mapping,contract).applicationGroups!.targets;
    const reused=targets.filter(t=>t.role==='sequence' && /OneSequence|TwoSequence/.test(t.source));
    expect(reused).toHaveLength(2); expect(reused[0]!.target).not.toBe(reused[1]!.target);
    for (const value of [{...input,one:{$sequence:[]}},{...input,nested:{$sequence:[{E:'missing'}]}},
      {...input,multiple:{$choice:{H:'h'},$choice2:{J:false,M:'both'}}},
      {...input,two:{$sequence:Array.from({length:5},()=>({K:3,L:'too many'}))}}]) expect(encodeComponentXml(contract,mapping,value).kind).toBe('value-invalid');
  });
  it('normalizes optional empty arrays and retains ambiguous and empty source controls',async()=>{
    const {contract,mapping}=await prepare();
    const input={id:'control',$choice:[{C:false,D:'d'}],nested:{$sequence:[]},two:{$sequence:[]},
      ambiguous:{$content:[{name:{namespace,local:'N'},value:1},{name:{namespace,local:'N'},value:2},{name:{namespace,local:'N'},value:3}]},empty:{$content:[]}};
    const before=JSON.stringify(input), encoded=encodeComponentXml(contract,mapping,input);
    if (encoded.kind!=='component-encoded') throw new Error(JSON.stringify(encoded));
    const decoded=decodeComponentXml(contract,mapping,encoded.bytes);
    if (decoded.kind!=='component-decoded') throw new Error(JSON.stringify(decoded));
    expect(decoded.validated.value).toEqual({...input,nested:{},two:{}});
    const again=encodeComponentXml(contract,mapping,decoded.validated.value);
    if (again.kind!=='component-encoded') throw new Error(JSON.stringify(again));
    expect(again.bytes).toEqual(encoded.bytes); expect(JSON.stringify(input)).toBe(before);
    expect(inspectComponentValueMapping(mapping,contract).applicationGroups!.dispositions.filter(r=>r.disposition==='retained-ordered').map(r=>r.reason)).toEqual(expect.arrayContaining(['ambiguous-group-partition','empty-capable-group-body']));
  });
  it('rejects hidden payload keys, accessors, proxies, sparse arrays and declaration collisions',async()=>{
    const {contract,mapping}=await prepare();
    const input={id:'x',$choice:[{A:1,B:'b'}]};
    for (const invalid of [Object.defineProperty({...input},'hidden',{value:1}),Object.assign({...input},{[Symbol('hidden')]:1}),
      Object.defineProperty({...input},'bad',{get(){throw new Error('must not execute');}}),new Proxy(input,{}),{...input,$choice:new Array(1)}]) expect(encodeComponentXml(contract,mapping,invalid).kind).toBe('value-invalid');
    const target=inspectComponentValueMapping(mapping,contract).applicationGroups!.targets.find(t=>t.defaults.typeName==='PaymentChoiceChoice')!.target;
    for (const typeName of ['Request','Response','Fault_0','Usage','Name','Options','Runtime','Result','PaymentChoice','PaymentChoiceChoiceAlternative1']) await expect(prepare({names:[{target,typeName}]})).rejects.toThrow(/collision/);
    expect(()=>parseApplicationGroups({names:[{target,typeName:'$Payment'}]})).toThrow();
    const groups=inspectComponentValueMapping(mapping,contract).applicationGroups!;
    expect(()=>{(groups.targets[0]!.resolved as {typeName:string}).typeName='Tampered';}).toThrow();
  });
  it('keeps source targets after relocation and unrelated declaration reorder, and guards relevant edits',async()=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const dir=await mkdtemp(path.resolve('tmp/conformance/application-groups/identity-')),original=await readFile(file,'utf8');
    const initial=await prepare(),targets=inspectComponentValueMapping(initial.mapping,initial.contract).applicationGroups!.targets;
    const declarations=original.match(/      <xs:complexType name="(?:Nested|MultipleChoices)"[^\n]+\n/g)!;
    const changed=original.replace(declarations[0]!,'').replace(declarations[1]!,declarations[1]!+declarations[0]!);
    const relocated=path.join(dir,'relocated.wsdl');await writeFile(relocated,changed);
    const reordered=await prepare({},relocated);
    expect(inspectComponentValueMapping(reordered.mapping,reordered.contract).applicationGroups!.targets).toEqual(targets);
    await writeFile(relocated,original.replace('name="A" type="xs:int"','name="AA" type="xs:int"'));
    const edited=await prepare({},relocated);
    const old=targets.find(t=>t.defaults.typeName==='PaymentChoiceChoiceAlternative1')!.target;
    expect(inspectComponentValueMapping(edited.mapping,edited.contract).applicationGroups!.targets.map(t=>t.target)).not.toContain(old);
  });
  it('allocates default collisions from source identity without altering business fields',async()=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const dir=await mkdtemp(path.resolve('tmp/conformance/application-groups/collision-')),original=await readFile(file,'utf8');
    const source=path.join(dir,'collision.wsdl');await writeFile(source,original.replaceAll('Nested','PaymentChoiceChoice'));
    const {contract,mapping}=await prepare({},source),groups=inspectComponentValueMapping(mapping,contract).applicationGroups!;
    const choice=groups.targets.find(t=>t.role==='choice' && t.source.startsWith('{'+namespace+'}PaymentChoice choice'))!;
    expect(choice.defaults.typeName).toMatch(/^PaymentChoiceChoice_[a-f0-9]+$/);
    expect(choice.resolved.propertyName).toBe('$choice');
    const value={id:'collision',choice:'unchanged',$choice:[{A:1,B:'b'}]};
    expect(encodeComponentXml(contract,mapping,value).kind).toBe('component-encoded');
  });
  it('retains variable-width repeated alternatives but executes differing fixed-width alternatives',async()=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const dir=await mkdtemp(path.resolve('tmp/conformance/application-groups/partition-')),original=await readFile(file,'utf8');
    const source=path.join(dir,'partition.wsdl');
    await writeFile(source,original.replace('<xs:sequence><xs:element name="A" type="xs:int"/><xs:element name="B" type="xs:string" nillable="true"/></xs:sequence>',
      '<xs:element name="A" type="xs:int" minOccurs="1" maxOccurs="2"/>'));
    const ambiguous=await prepare({},source);
    expect(inspectComponentValueMapping(ambiguous.mapping,ambiguous.contract).applicationGroups!.dispositions.find(r=>r.source.endsWith('PaymentChoice'))?.reason).toBe('ambiguous-group-partition');
    await writeFile(source,original.replace('<xs:sequence><xs:element name="C" type="xs:boolean"/><xs:element name="D" type="xs:string"/></xs:sequence>', '<xs:element name="C" type="xs:boolean"/>'));
    const fixed=await prepare({},source),value={id:'fixed',$choice:[{A:1,B:'b'},{C:true},{A:2,B:'c'}]};
    const encoded=encodeComponentXml(fixed.contract,fixed.mapping,value);
    if (encoded.kind!=='component-encoded') throw new Error(JSON.stringify(encoded));
    const decoded=decodeComponentXml(fixed.contract,fixed.mapping,encoded.bytes);
    if (decoded.kind!=='component-decoded') throw new Error(JSON.stringify(decoded));
    expect(decoded.validated.value).toEqual(value);
  });
  it('rejects nested sequence-item alias collisions in one object scope',async()=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const dir=await mkdtemp(path.resolve('tmp/conformance/application-groups/scopes-')),original=await readFile(file,'utf8');
    const source=path.join(dir,'scopes.wsdl');
    await writeFile(source,original.replace('<xs:element name="E" type="xs:string"/>','<xs:choice><xs:element name="E" type="xs:string"/><xs:element name="EE" type="xs:string"/></xs:choice>'));
    const initial=await prepare({},source),targets=inspectComponentValueMapping(initial.mapping,initial.contract).applicationGroups!.targets.filter(t=>t.role==='choice' && t.source.startsWith('{'+namespace+'}Nested '));
    expect(targets).toHaveLength(2);
    await expect(prepare({names:targets.map(t=>({target:t.target,propertyName:'$payment'}))},source)).rejects.toThrow(/propertyName collision/);
  });
  it.each(['leading','trailing'])('recovers repeated sequence boundaries with optional %s fields',async(mode)=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const dir=await mkdtemp(path.resolve('tmp/conformance/application-groups/delimiter-')),original=await readFile(file,'utf8');
    const source=path.join(dir,'delimiter.wsdl');
    await writeFile(source,original.replace(mode==='leading'?'<xs:element name="K" type="xs:int"/>':'<xs:element name="L" type="xs:string"/>',
      mode==='leading'?'<xs:element name="K" type="xs:int" minOccurs="0"/>':'<xs:element name="L" type="xs:string" minOccurs="0"/>'));
    const {contract,mapping}=await prepare({},source),value={id:'delimiter',$choice:[{A:1,B:'b'}],two:{$sequence:mode==='leading'?[{L:'a'},{K:2,L:'b'},{L:'c'}]:[{K:1},{K:2,L:'b'},{K:3}]}};
    const encoded=encodeComponentXml(contract,mapping,value);
    if (encoded.kind!=='component-encoded') throw new Error(JSON.stringify(encoded));
    const decoded=decodeComponentXml(contract,mapping,encoded.bytes);
    if (decoded.kind!=='component-decoded') throw new Error(JSON.stringify(decoded));
    expect(decoded.validated.value).toEqual(value);
  });
  it.each([false,true])('selects nested alternatives from source leaves rather than shared wrapper names (configured=%s)',async(configured)=>{
    const initial=await prepare(),sites=inspectComponentValueMapping(initial.mapping,initial.contract).applicationGroups!.targets
      .filter(t=>t.role==='choice' && t.defaults.typeName.startsWith('NestedAlternativesChoiceAlternative'));
    expect(sites).toHaveLength(2);
    const {contract,mapping}=configured?await prepare({names:sites.map(t=>({target:t.target,propertyName:'$method'}))}):initial;
    const key=configured?'$method':'$choice';
    const value={id:'nested-alternatives',$choice:[{A:7,B:'ordinary'}],
      deep:{$choice:[{[key]:{bankCode:9}},{[key]:{cardNumber:'card'}},{[key]:{bankLabel:'last'}}]}};
    const encoded=encodeComponentXml(contract,mapping,value);
    if (encoded.kind!=='component-encoded') throw new Error(JSON.stringify(encoded));
    const decoded=decodeComponentXml(contract,mapping,encoded.bytes);
    if (decoded.kind!=='component-decoded') throw new Error(JSON.stringify(decoded));
    expect(decoded.validated.value).toEqual(value);
    const invalid={...value,deep:{$choice:[{[key]:{cardNumber:'mixed',bankCode:9}}]}},before=JSON.stringify(invalid);
    expect(encodeComponentXml(contract,mapping,invalid).kind).toBe('value-invalid');
    expect(JSON.stringify(invalid)).toBe(before);
  });
  it('keeps distinct direction-scoped source stems and reserves record symbols across the selected source',async()=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const dir=await mkdtemp(path.resolve('tmp/conformance/application-groups/directions-')),original=await readFile(file,'utf8');
    const source=path.join(dir,'directions.wsdl'),type='<xs:complexType name="Foo_bar"><xs:choice><xs:element name="Q" type="xs:string"/><xs:element name="R" type="xs:int"/></xs:choice></xs:complexType>';
    await writeFile(source,original.replaceAll('PaymentChoice','Foo-bar').replace('<xs:element name="SubmitResponse" type="t:Foo-bar"/>',
      type+'<xs:element name="SubmitResponse" type="t:Foo_bar"/>'));
    const {contract,mapping}=await prepare({},source),output=createComponentDirectionalMapping(contract,mapping,{kind:'output'});
    if (output.kind!=='component-mapping') throw new Error(output.kind);
    const inputNames=inspectComponentValueMapping(mapping,contract).applicationGroups!.targets.map(t=>t.resolved.typeName);
    const outputNames=inspectComponentValueMapping(output,contract).applicationGroups!.targets.map(t=>t.resolved.typeName);
    expect(inputNames).toContain('Foo_u2d_barChoice');expect(outputNames).toContain('Foo_u5f_barChoice');
    expect(inputNames.some(name=>outputNames.includes(name))).toBe(false);
    const target=inspectComponentValueMapping(mapping,contract).applicationGroups!.targets.find(t=>t.defaults.typeName==='Foo_u2d_barChoice')!.target;
    await expect(prepare({names:[{target,typeName:applicationRecordName(globalId('type',{namespace,local:'Foo_bar'}))}]},source)).rejects.toThrow(/collision/);
  });
});
