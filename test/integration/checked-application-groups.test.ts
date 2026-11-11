import {describe,expect,it,vi} from 'vitest';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {canonicalJson} from '../../src/compiler/catalogErrors.js';
import path from 'node:path';
import {Ajv} from 'ajv';
import {SaxesParser} from 'saxes';
import {runGenerationPipeline} from '../../src/pipeline.js';
import type {ApplicationGroupTarget, ApplicationGroupsOptions} from '../../src/compiler/applicationGroups.js';
import {reconstructComponentSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {encodeComponentXml} from '../../src/compiler/directCodec.js';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping,inspectComponentValueMapping} from '../../src/compiler/directValues.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';
import {composeCheckedDocumentation, validateCheckedDocumentation} from '../helpers/checkedDocumentation.js';

vi.mock('@techspokes/typescript-wsdl-client',()=>import('../../src/index.js'));
const source=path.resolve('test/conformance/fixtures/assessment/application-groups.wsdl');
async function generate(applicationGroups: ApplicationGroupsOptions) {
  await mkdir('tmp/conformance/application-groups',{recursive:true});
  const project=await mkdtemp(path.resolve('tmp/conformance/application-groups/case-'));
  const result=await runGenerationPipeline({model:'checked-components-v1',wsdl:source,checkedComponents:{applicationGroups},
    clientOutDir:path.join(project,'client'),openapi:{outFile:path.join(project,'openapi.json')},
    gateway:{outDir:path.join(project,'gateway'),serviceSlug:'payment',versionSlug:'v1'},app:{appDir:project}});
  return {project,result};
}
describe('combined application-group generation',()=>{
  it.each([false,true])('retains the issued presentation in actual SOAP success and fault directions (configured=%s)',async(configured)=>{
    const namespace='urn:checked:groups',soap='http://schemas.xmlsoap.org/soap/envelope/';
    const selected=await selectComponentOperation(source,{portType:{namespace,local:'PaymentPortType'},binding:{namespace,local:'PaymentBinding'},operation:'Submit'},
      {loading:{policy:{fileRoots:[path.dirname(source)]}}});
    if (selected.kind!=='selected') throw new Error(selected.kind);
    const defaults=createComponentValueMapping(selected.contract,{kind:'input'},{},{});
    if (defaults.kind!=='component-mapping') throw new Error(defaults.kind);
    const target=inspectComponentValueMapping(defaults,selected.contract).applicationGroups!.targets.find(t=>t.defaults.typeName==='PaymentChoiceChoice')!.target;
    const mapping=createComponentValueMapping(selected.contract,{kind:'input'},{},configured?{names:[{target,propertyName:'$payment'}]}:{});
    if (mapping.kind!=='component-mapping') throw new Error(mapping.kind);
    const key=configured?'$payment':'$choice',value={id:'wire',[key]:[{A:7,B:{$nil:true}}]};
    let fault=false,calls=0;const requests:string[]=[];
    const server=createServer(async(request,response)=>{
      let xml='';for await (const chunk of request) xml+=String(chunk);calls++;
      requests.push(xml);
      const content='<t:A>7</t:A><t:B xsi:nil="true"/>';
      response.writeHead(fault?500:200,{'Content-Type':'text/xml'});
      response.end(`<s:Envelope xmlns:s="${soap}" xmlns:t="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body>`
        +(fault?`<s:Fault><faultcode>s:Server</faultcode><faultstring>owned</faultstring><detail><t:PaymentFault id="wire">${content}</t:PaymentFault></detail></s:Fault>`
          :`<t:SubmitResponse id="wire">${content}</t:SubmitResponse>`)+ '</s:Body></s:Envelope>');
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const address=server.address();if (!address || typeof address==='string') throw new Error('Owned port required');
    try {
      const options={service:{namespace,local:'PaymentService'},port:'PaymentPort',endpoint:`http://127.0.0.1:${address.port}/payment`};
      expect(await exchangeComponentSoap(selected.contract,mapping,value,options)).toMatchObject({kind:'soap-response',decoded:{validated:{value}}});
      fault=true;
      expect(await exchangeComponentSoap(selected.contract,mapping,value,options)).toMatchObject({kind:'soap-fault',decoded:{validated:{value}}});
      expect(calls).toBe(2);
      for (const xml of requests) {
        const names:string[]=[],texts:string[]=[],parser=new SaxesParser({xmlns:true});
        parser.on('opentag',tag=>names.push(`{${tag.uri}}${tag.local}`));parser.on('text',text=>{if(text.trim())texts.push(text);});parser.write(xml).close();
        expect(names).toContain('{'+namespace+'}A');expect(texts).toContain('7');expect(xml).not.toContain('$payment');
      }
    } finally {server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
  it('discovers exact targets, generates matching schemas and reloads configured mappings',async()=>{
    const initial=await generate({});
    const inventory=JSON.parse(await readFile(path.join(initial.project,'client/inventory.json'),'utf8')) as {applicationGroups:{targets:ApplicationGroupTarget[]}};
    const targets=inventory.applicationGroups.targets;
    expect(initial.result.checked?.applicationGroups).toEqual(inventory.applicationGroups);
    expect(targets.length).toBeGreaterThan(3);
    const site=targets.find(t=>t.defaults.typeName==='PaymentChoiceChoice')!, alternatives=targets.filter(t=>t.defaults.typeName.startsWith('PaymentChoiceChoiceAlternative')).sort((a,b)=>a.defaults.typeName.localeCompare(b.defaults.typeName));
    const names=[{target:site.target,propertyName:'$payment',typeName:'PaymentMethod'},
      {target:alternatives[0]!.target,typeName:'CardPayment'},{target:alternatives[1]!.target,typeName:'BankPayment'}];
    const {project}=await generate({names});
    const generated=await readFile(path.join(project,'client/operations/0/client.ts'),'utf8').catch(()=>readFile(path.join(project,'client/client.ts'),'utf8'));
    expect(generated).toContain('PaymentMethod');
    const document=JSON.parse(await readFile(path.join(project,'openapi.json'),'utf8'));
    for (const name of ['PaymentMethod','CardPayment','BankPayment']) {
      expect(Object.hasOwn(document.components.schemas,name)).toBe(true);
      expect(generated).toContain(`export type ${name} =`);
    }
    const composed=composeCheckedDocumentation(document);
    for (const name of ['PaymentMethod','CardPayment','BankPayment']) expect(Object.hasOwn(composed.components.schemas,'checked__'+name)).toBe(true);
    for (const role of ['request','response'] as const) {
      const validate=validateCheckedDocumentation(composed,'/v1/payment/Submit',role);
      expect(validate({id:'one',$payment:[{A:1,B:'card'}]})).toBe(true);
      expect(validate({id:'one',$choice:[{A:1,B:'card'}]})).toBe(false);
      expect(validate({id:'one',$payment:[{A:'1',B:'card'}]})).toBe(false);
      expect(validate({id:'one',$payment:[{A:1,B:'card'}],tree:{$choice:{branch:{$choice:{leaf:'end'}}}}})).toBe(true);
      expect(validate({id:'one',$payment:[{A:1,B:'card'}],tree:{$choice:{branch:{$choice:{leaf:7}}}}})).toBe(false);
    }
    const schemas=JSON.parse(await readFile(path.join(project,'gateway/routes/0/schemas.json'),'utf8')) as Record<string,object>;
    const validate=new Ajv({strict:true,coerceTypes:false,useDefaults:false,removeAdditional:false}).compile(schemas.request!);
    expect(validate({id:'one',$payment:[{A:1,B:'card'}]})).toBe(true);
    expect(validate({id:'one',$choice:[{A:1,B:'card'}]})).toBe(false);
    const files=JSON.parse(await readFile(path.join(project,'client/source-resources.json'),'utf8')) as {runtime:{capsuleFiles:Record<string,string>;localSource:string}};
    const capsule=await readFile(path.resolve(project,'client',Object.values(files.runtime.capsuleFiles)[0]!));
    const restored=await reconstructComponentSourceCapsule(capsule,path.resolve(project,'client',files.runtime.localSource),{loading:{policy:{fileRoots:[path.join(project,'client')]}}});
    expect(restored.kind).toBe('reconstructed-component');
    if (restored.kind!=='reconstructed-component') throw new Error(JSON.stringify(restored));
    const input=restored.mappings.find(m=>m.direction.kind==='input')!;
    expect(encodeComponentXml(restored.contract,input,{id:'one',$payment:[{A:1,B:'card'}]}).kind).toBe('component-encoded');
    const saved=JSON.parse(capsule.toString()) as Record<string,unknown>;
    saved.applicationGroups={names:[{target:'unknown',typeName:'UnknownAlias'}]};
    delete saved.fingerprint;saved.fingerprint=createHash('sha256').update(canonicalJson(saved)).digest('hex');
    const tampered=await reconstructComponentSourceCapsule(Buffer.from(JSON.stringify(saved)),path.resolve(project,'client',files.runtime.localSource),{loading:{policy:{fileRoots:[path.join(project,'client')]}}});
    expect(tampered.kind).toBe('incompatible-artifact');
  });
  it('rejects unknown configured targets before creating outputs',async()=>{
    await expect(generate({names:[{target:'unknown',typeName:'Payment'}]})).rejects.toThrow(/unknown|stale/);
  });
  it.each(['__proto__','toString','definitions'])('keeps schema dictionaries distinct from data and configured names (%s)',async(typeName)=>{
    const initial=await generate({}),inventory=JSON.parse(await readFile(path.join(initial.project,'client/inventory.json'),'utf8')) as {applicationGroups:{targets:ApplicationGroupTarget[]}};
    const target=inventory.applicationGroups.targets.find(t=>t.defaults.typeName==='PaymentChoiceChoice')!.target;
    const {project}=await generate({names:[{target,propertyName:'$id',typeName}]});
    const spec=JSON.parse(await readFile(path.join(project,'openapi.json'),'utf8')) as {components:{schemas:Record<string,{properties?:Record<string,unknown>}>}};
    expect(Object.hasOwn(spec.components.schemas,typeName)).toBe(true);
    const root=Object.values(spec.components.schemas).find(schema=>schema.properties && Object.hasOwn(schema.properties,'choice'))!;
    expect(Object.hasOwn(root.properties!,'definitions')).toBe(true);
    expect(Object.hasOwn(root.properties!,'$id')).toBe(true);
    expect(Object.values(spec.components.schemas).every(schema=>!!schema && typeof schema==='object')).toBe(true);
    const runtime=JSON.parse(await readFile(path.join(project,'gateway/routes/0/schemas.json'),'utf8')) as {request:object};
    const validate=new Ajv({strict:true,ownProperties:true,coerceTypes:false,useDefaults:false,removeAdditional:false}).compile(runtime.request);
    expect(validate({id:'wire',definitions:'business definitions',$id:[{A:1,B:'b'}]})).toBe(true);
  });
  it('keeps keyed/open helper definitions consistent when the option is enabled',async()=>{
    await mkdir('tmp/conformance/application-groups',{recursive:true});
    const project=await mkdtemp(path.resolve('tmp/conformance/application-groups/keyed-'));
    await runGenerationPipeline({model:'checked-components-v1',wsdl:path.resolve('test/conformance/fixtures/assessment/keyed.wsdl'),checkedComponents:{applicationGroups:{}},
      clientOutDir:path.join(project,'client'),openapi:{outFile:path.join(project,'openapi.json')},gateway:{outDir:path.join(project,'gateway'),serviceSlug:'keyed',versionSlug:'v1'}});
    const source=await readFile(path.join(project,'client/operations/0/client.ts'),'utf8');
    const aliases=[...source.matchAll(/export type ([A-Za-z0-9_]+) =/g)].map(m=>m[1]);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
