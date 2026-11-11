import {expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Ajv} from 'ajv';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {generateComponentGateway} from '../../src/gateway/generateCheckedGateway.js';
import {composeOpenApiDocuments} from '../../src/index.js';

type Schema = Record<string, unknown>;
type Media = {content: {'application/json': {schema: Schema}}};
interface Document {
  components: {schemas: Record<string, Schema>};
  paths: Record<string, {post: {requestBody: Media; responses: Record<string, Media>}}>;
}
const namespace = 'urn:checked:forecast';
const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};

it('composes independently generated identical selectors without conflating structural contracts or runtime resources', async () => {
  await mkdir('tmp/test-generation', {recursive: true});
  const root = await mkdtemp(path.resolve('tmp/test-generation/checked-composition-'));
  try {
    const original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
    const documents: {key: string; document: Document}[] = [];
    for (const key of ['first', 'second']) {
      const directory = path.join(root, key), file = path.join(directory, 'service.wsdl');
      await mkdir(directory);
      // @why #467: selectors and resource IDs are identical even though all three structural contracts differ.
      await writeFile(file, key === 'first' ? original : original.replaceAll('type="xs:string"', 'type="xs:boolean"'));
      const selected = await selectComponentOperation(file, selector, {limits: {}, loading: {policy: {fileRoots: [root]}}});
      if (selected.kind !== 'selected') throw new Error(selected.rule);
      const capsule = await createComponentSourceCapsule(selected.contract, {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'});
      if (capsule.kind !== 'component-capsule') throw new Error(capsule.rule);
      const before = Buffer.from(capsule.bytes);
      const native = await reconstructComponentSourceCapsule(capsule.bytes, file, {limits: {}, loading: {policy: {fileRoots: [root]}}});
      if (native.kind !== 'reconstructed-component') throw new Error(native.rule);
      const options = {clientDir: path.join(directory, 'client'), gatewayDir: path.join(directory, 'gateway'),
        openapiFile: path.join(directory, 'openapi.json'), routePath: '/' + key};
      const generated = await generateComponentGateway(native, options);
      const document = generated.doc as Document;
      const runtime = JSON.parse(await readFile(path.join(directory, 'gateway/schemas.json'), 'utf8')) as Record<string, Schema>;
      const documented = document.paths['/' + key]!.post;
      const roles = [
        ['request', documented.requestBody.content['application/json'].schema,
          [{city: 'Oslo', days: 2}, {city: true, days: 2}, {city: 'Oslo'}, {city: 'Oslo', days: '2'}]],
        ['response', documented.responses['200']!.content['application/json'].schema,
          [{city: 'Oslo', temperature: [2], complete: true}, {city: true, temperature: [2], complete: true}, {city: 'Oslo', complete: 'true'}]],
        ['fault', documented.responses['502']!.content['application/json'].schema,
          [{fault: {name: 'ForecastError', code: {namespace: '', local: 'Server'}, string: 'Error'}, value: {code: 'ERR', message: 'Retry'}},
            {fault: {name: 'ForecastError', code: {namespace: '', local: 'Server'}, string: 'Error'}, value: {code: true, message: false}},
            {fault: {name: 'ForecastError', code: {namespace: '', local: 'Server'}, string: 'Error'}, value: {code: 4}}]],
      ] as const;
      for (const [role, schema, cases] of roles) {
        const settings = {strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false};
        const nativeValidate = new Ajv(settings).compile(runtime[role]!);
        const documentedValidate = new Ajv(settings).compile({...schema, components: document.components});
        const results = cases.map(value => {
          const input = JSON.stringify(value), accepted = nativeValidate(value);
          expect(documentedValidate(value)).toBe(accepted);
          expect(JSON.stringify(value)).toBe(input);
          return accepted;
        });
        expect(results).toEqual([key === 'first', key === 'second', ...cases.slice(2).map(() => false)]);
      }
      const bytes = await readFile(options.openapiFile, 'utf8');
      await generateComponentGateway(native, options);
      expect(await readFile(options.openapiFile, 'utf8')).toBe(bytes);
      expect(Buffer.from(capsule.bytes)).toEqual(before);
      expect(JSON.parse(await readFile(path.join(directory, 'gateway/schemas.json'), 'utf8'))).toEqual(runtime);
      const aborted = new AbortController(); aborted.abort();
      await expect(generateComponentGateway(native, {...options, signal: aborted.signal})).rejects.toThrow(/cancel/i);
      documents.push({key, document});
    }
    const before = JSON.stringify(documents);
    const composed = composeOpenApiDocuments(documents) as unknown as Document;
    expect(composeOpenApiDocuments([...documents].reverse())).toEqual(composed);
    expect(JSON.stringify(documents)).toBe(before);
    for (const key of ['first', 'second']) {
      const operation = composed.paths['/' + key]!.post;
      const fault = {name: 'ForecastError', code: {namespace: '', local: 'Server'}, string: 'Error'};
      for (const [schema, first, second, invalid] of [
        [operation.requestBody.content['application/json'].schema, {city: 'Oslo', days: 2}, {city: true, days: 2}, {city: true, days: '2'}],
        [operation.responses['200']!.content['application/json'].schema, {city: 'Oslo', temperature: [], complete: true},
          {city: true, temperature: [], complete: true}, {city: true, complete: 'true'}],
        [operation.responses['502']!.content['application/json'].schema, {fault, value: {code: 'ERR', message: 'Retry'}},
          {fault, value: {code: true, message: false}}, {fault, value: {code: 4}}],
      ] as const) {
        const validate = new Ajv({strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false})
          .compile({...schema, components: composed.components});
        expect(validate(first)).toBe(key === 'first');
        expect(validate(second)).toBe(key === 'second');
        expect(validate(invalid)).toBe(false);
      }
    }
  } finally {await rm(root, {recursive: true, force: true});}
}, 60_000);
