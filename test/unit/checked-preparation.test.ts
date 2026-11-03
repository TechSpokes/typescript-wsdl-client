import {expect, it, vi} from 'vitest';
import {planCheckedComponents} from '../../src/checkedPlanning.js';
import {runGenerationPipeline} from '../../src/pipeline.js';
import * as clients from '../../src/client/generateDirectClient.js';
import * as gateways from '../../src/gateway/generateCheckedGateway.js';
import * as budgets from '../../src/compiler/semanticBudget.js';
import {inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';

const counts = vi.hoisted(() => ({metadata: 0}));
vi.mock('soap/lib/wsdl/index.js', async original => {
  const actual = await original<typeof import('soap/lib/wsdl/index.js')>();
  return {...actual, WSDL: class extends actual.WSDL {
    constructor(...args: ConstructorParameters<typeof actual.WSDL>) {super(...args); counts.metadata++;}
  }};
});

it('keeps unexpected lowering exceptions operational and redacts their details', async () => {
  const gateway = vi.spyOn(gateways, 'generateComponentServiceGateway');
  try {
    for (const failure of [Object.assign(new Error('private-path-and-source-details'), {code: 'EACCES'}),
      new TypeError('private internal details'), {kind: 'resource-limit'}]) {
      gateway.mockRejectedValueOnce(failure);
      const report = await planCheckedComponents('docs/examples/checked-forecast.wsdl');
      expect(report).toMatchObject({ready: false, blockers: [{category: 'operational-failure', reason: 'native-preparation-failed'}]});
      expect(JSON.stringify(report)).not.toContain('private');
    }
  } finally {gateway.mockRestore();}
});

it('preserves cancellation and authentic sticky resource exhaustion during lowering', async () => {
  const gateway = vi.spyOn(gateways, 'generateComponentServiceGateway');
  const controller = new AbortController();
  try {
    gateway.mockImplementationOnce(async () => {controller.abort(); throw new Error('interrupted');});
    const cancelled = await planCheckedComponents('docs/examples/checked-forecast.wsdl', {signal: controller.signal});
    expect(cancelled.blockers[0]?.category).toBe('cancelled');
    const application = vi.spyOn(budgets, 'createApplicationBudget').mockImplementation(() => budgets.createSemanticBudget({maxWork: 125_000_000}));
    try {
      gateway.mockImplementationOnce(async operations => {
        const {budget} = inspectDirectOperation(operations[0]!.contract).context;
        budget.guard(() => budget.chargeWork(Number.MAX_SAFE_INTEGER));
        throw budget.failure();
      });
      const exhausted = await planCheckedComponents('docs/examples/checked-forecast.wsdl');
      expect(exhausted.blockers[0]).toMatchObject({category: 'resource-limit', reason: 'request-budget'});
    } finally {application.mockRestore();}
  } finally {gateway.mockRestore();}
});

it('rejects missing, overlapping and unsupported outputs before any metadata request', async () => {
  let requests = 0;
  const server = createServer((_request, response) => {requests++; response.end('must never be read');});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned address required');
  const base = {model: 'checked-components-v1' as const, wsdl: `http://127.0.0.1:${address.port}/source.wsdl`,
    clientOutDir: 'tmp/test-generation/invalid-output/client', openapi: {outFile: 'tmp/test-generation/invalid-output/openapi.json'},
    gateway: {outDir: 'tmp/test-generation/invalid-output/gateway', versionSlug: 'v1', serviceSlug: 'forecast'}};
  counts.metadata = 0;
  try {
    await expect(runGenerationPipeline({...base, clientOutDir: undefined})).rejects.toThrow('explicit');
    await expect(runGenerationPipeline({...base, openapi: {outFile: base.clientOutDir}})).rejects.toThrow('overlap');
    await expect(runGenerationPipeline({...base, compiler: {choice: 'union'}})).rejects.toThrow('legacy compiler');
    await expect(runGenerationPipeline({...base, catalogOut: 'tmp/test-generation/forbidden-catalog.json'})).rejects.toThrow('legacy catalog');
    expect(requests).toBe(0); expect(counts.metadata).toBe(0);
  } finally {await new Promise<void>(resolve => server.close(() => resolve()));}
});

it('shares metadata across operations and emits the prepared client and gateway lowerings once', async () => {
  mkdirSync('tmp/test-generation', {recursive: true});
  const root = mkdtempSync(path.resolve('tmp/test-generation/preparation-'));
  const wsdl = path.join(root, 'source.wsdl');
  writeFileSync(wsdl, readFileSync('docs/examples/checked-forecast.wsdl', 'utf8')
    .replace('</wsdl:portType>', '<wsdl:operation name="Other"><wsdl:input message="t:ForecastInput"/><wsdl:output message="t:ForecastOutput"/></wsdl:operation></wsdl:portType>')
    .replace('</wsdl:binding>', '<wsdl:operation name="Other"><soap:operation soapAction="urn:Other"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>'));
  const client = vi.spyOn(clients, 'generateComponentClient'), gateway = vi.spyOn(gateways, 'generateComponentServiceGateway');
  counts.metadata = 0;
  try {
    const result = await runGenerationPipeline({model: 'checked-components-v1', wsdl,
      clientOutDir: path.join(root, 'client'), openapi: {outFile: path.join(root, 'openapi.json')},
      gateway: {outDir: path.join(root, 'gateway'), versionSlug: 'v1', serviceSlug: 'forecast'}});
    expect(result.checked?.operations.filter(o => o.generated).map(o => o.operation)).toEqual(['GetForecast', 'Other']);
    expect(counts.metadata).toBe(1);
    expect(client).toHaveBeenCalledTimes(2); expect(gateway).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(path.join(root, 'openapi.json'), 'utf8')).paths).toHaveProperty('/v1/forecast/Other');
    writeFileSync(wsdl, readFileSync(wsdl, 'utf8').replace('style="document"', 'style="rpc"'));
    const changed = await planCheckedComponents(wsdl);
    expect(changed.ready).toBe(false);
    expect(changed.blockers.flatMap(b => b.affected.map(s => s.operation)).sort()).toEqual(['GetForecast', 'Other']);
  } finally {client.mockRestore(); gateway.mockRestore(); rmSync(root, {recursive: true, force: true});}
});

it('records independent SOAP bootstrap counts for one ready Forecast plan', async () => {
  counts.metadata = 0;
  const start = performance.now();
  const plan = await planCheckedComponents('docs/examples/checked-forecast.wsdl');
  expect(plan.ready).toBe(true);
  console.log(JSON.stringify({fixture: 'Forecast', operations: plan.selection?.selectors.length,
    metadata: counts.metadata, elapsedMs: performance.now() - start}));
  expect(counts.metadata).toBe(1);
});
