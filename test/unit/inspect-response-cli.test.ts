import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const execute = promisify(execFile);
const source = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
const namespace = 'urn:checked:forecast';
const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
let directory: string;
beforeAll(async () => {
  const parent = path.resolve('tmp/conformance'); await mkdir(parent, {recursive: true});
  directory = await mkdtemp(path.join(parent, 'inspect-cli-'));
  await writeFile(path.join(directory, 'config.json'), JSON.stringify({selectors: [selector], fileRoots: [path.dirname(source)], sourceResources: [], sourceOrigins: []}));
});
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
const invoke = async (response: string, report: string, extra: string[] = []) => {
  const file = path.join(directory, `${report}.xml`);
  await writeFile(file, response);
  try {
    await execute(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'inspect-response', '--wsdl-source', source,
      '--checked-config', path.join(directory, 'config.json'), '--operation', 'GetForecast', '--response-file', file,
      '--report', path.join(directory, report), ...extra], {timeout: 30_000, maxBuffer: 1024 * 1024});
    return 0;
  } catch (error) {return (error as {code?: number}).code;}
};
const soap = (complete: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetForecastResponse xmlns="${namespace}"><city>private-city-marker</city><temperature>7</temperature><complete>${complete}</complete></GetForecastResponse></s:Body></s:Envelope>`;

describe('offline inspection command', () => {
  it('uses conformance exit status for a valid protocol fault while reporting that it is a fault', async () => {
    const metadata = path.join(directory, 'fault-metadata.json');
    await writeFile(metadata, JSON.stringify({status: 500, contentType: 'text/xml; charset=utf-8'}));
    const response = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>private-protocol-reason</faultstring></s:Fault></s:Body></s:Envelope>';
    expect(await invoke(response, 'protocol-fault.json', ['--response-metadata', metadata])).toBe(0);
    const report = await readFile(path.join(directory, 'protocol-fault.json'), 'utf8');
    expect(JSON.parse(report)).toMatchObject({kind: 'conforming', admitted: false, executed: false,
      fault: {assessment: 'conforming', observed: true, declared: false}});
    expect(report).not.toContain('private-protocol-reason');
  });
  it('reports scoped conformance without exposing application values or contacting the declared endpoint', async () => {
    expect(await invoke(soap('true'), 'valid.json')).toBe(0);
    const report = await readFile(path.join(directory, 'valid.json'), 'utf8');
    expect(JSON.parse(report)).toMatchObject({kind: 'conforming'});
    expect(report).toContain('unassessed');
    expect(report).not.toContain('private-city-marker');
  });
  it('uses mismatch exit status for invalid upstream values and exclusive publication for existing reports', async () => {
    expect(await invoke(soap('not-a-boolean'), 'invalid.json')).toBe(1);
    const original = await readFile(path.join(directory, 'invalid.json'), 'utf8');
    expect(original).not.toContain('not-a-boolean');
    expect(await invoke(soap('true'), 'invalid.json')).toBe(2);
    expect(await readFile(path.join(directory, 'invalid.json'), 'utf8')).toBe(original);
  });
  it('does not fabricate successful HTTP metadata for an XML-only capture', async () => {
    const metadata = path.join(directory, 'metadata.json');
    await writeFile(metadata, JSON.stringify({status: 500, contentType: 'text/xml; charset=utf-8'}));
    expect(await invoke(soap('true'), 'http.json', ['--response-metadata', metadata])).toBe(1);
  });
});
