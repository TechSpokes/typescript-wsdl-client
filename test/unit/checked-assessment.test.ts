/** Expectations follow direct XSD rules and observable diagnostic/admission guarantees. */
import {describe, it, expect} from 'vitest';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {assessSchemaSource, serializeAssessmentReport, assessmentExitCode, aggregateAssessment, parseAssessmentReport} from '../../src/compiler/checkedAssessment.js';

const root = path.resolve('test/conformance/fixtures/assessment');
const assess = (source: string, extra: Partial<Parameters<typeof assessSchemaSource>[1]> = {}) => assessSchemaSource(source, {loading: {policy: {fileRoots: [root]}}, ...extra});
async function altered(text: string) {
  const directory = await mkdtemp(path.resolve('tmp/conformance/assessment/case-'));
  const source = path.join(directory, 'source.xsd');
  await writeFile(source, text);
  return assessSchemaSource(source, {loading: {policy: {fileRoots: [directory]}}});
}
describe('checked source assessment', () => {
  it('establishes a nontrivial ordered/repeated scalar schema while refusing generation admission', async () => {
    const report = await assess(path.join(root, 'direct.xsd'));
    expect(report.schema).toBe('established');
    expect(report.correspondence).toBe('established');
    expect(report.schemaEligible).toBe(true);
    expect(report.admitted).toBe(false);
    expect(assessmentExitCode(report)).toBe(0);
    expect(JSON.parse(serializeAssessmentReport(report))).toEqual(report);
    expect(serializeAssessmentReport(report)).not.toContain('file:');
    expect(serializeAssessmentReport(report)).not.toContain(root);
  });
  it('matches CLI/API reports and validates diagnostic consistency', async () => {
    const source = path.join(root, 'direct.xsd');
    const output = path.resolve('tmp/conformance/assessment/cli-report.json');
    const api = await assess(source);
    const cli = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'assess', '--wsdl-source', source, '--report', output], {encoding: 'utf8'});
    expect(cli.status).toBe(0);
    const cliReport = parseAssessmentReport(await readFile(output, 'utf8'));
    const apiReport = parseAssessmentReport(serializeAssessmentReport(api));
    // Native request IDs are private process-local handles; their text contributes to logical work.
    // Semantic results/provenance and node accounting agree across processes.
    expect({...cliReport, usage: {...cliReport.usage, work: 0}}).toEqual({...apiReport, usage: {...apiReport.usage, work: 0}});
    expect(cliReport.usage.work).toBeLessThanOrEqual(cliReport.limits.maxWork);
    expect(apiReport.usage.work).toBeLessThanOrEqual(apiReport.limits.maxWork);
    expect(() => parseAssessmentReport(JSON.stringify({...api, reportVersion: 'future'}))).toThrow();
    expect(() => parseAssessmentReport(JSON.stringify({...api, schema: 'disproved', schemaEligible: false}))).toThrow();
    expect(() => parseAssessmentReport(JSON.stringify({...api, admitted: true}))).toThrow();
    expect(() => parseAssessmentReport(JSON.stringify({...api, obligations: []}))).toThrow();
    expect(() => parseAssessmentReport(JSON.stringify({...api, operations: [null], resources: [null]}))).toThrow();
    expect(() => parseAssessmentReport(JSON.stringify({...api, obligations: [{rule: 'unfinished-assessment', component: 'actual', context: 'actual', basis: api.basis, status: 'established', reason: ''}]}))).toThrow();
    const mismatch = await assess(source, {expectedIdentity: 'foreign-source-context'});
    expect(mismatch.schema).toBe('inconclusive');
    expect(mismatch.obligations.some(o => o.rule === 'source-context-match')).toBe(true);
  });
  it('does not turn rejection of a hypothetical membership into original-schema invalidity', async () => {
    const source = path.join(root, 'direct.xsd');
    const input = await loadSemanticSchemaInput(source, {policy: {fileRoots: [root]}});
    const prepared = prepareSourceSchemaRequest(input);
    expect(prepared.kind).toBe('prepared');
    if (prepared.kind !== 'prepared') throw new Error('source preparation failed');
    const member = prepared.request.graph.nodes[0]!;
    const rejected = prepared.request.candidate({key: 'collision', active: prepared.request.actual.members, additions: [member]});
    expect(rejected.kind).toBe('candidate-rejected');
    expect((await assess(source)).schema).toBe('established');
  });
  it('does not turn a missing required duty or an empty inventory into established', () => {
    expect(aggregateAssessment(['a', 'b'], new Map([['a', 'established']]))).toBe('inconclusive');
    expect(aggregateAssessment([], new Map())).toBe('inconclusive');
    expect(aggregateAssessment(['a', 'b'], new Map([['a', 'disproved']]))).toBe('disproved');
  });
  it('proves an actual invalid boolean and refuses eligibility', async () => {
    const source = await readFile(path.join(root, 'direct.xsd'), 'utf8');
    const report = await altered(source.replace('name="request"', 'nillable="bogus" name="request"'));
    expect(report.schema).toBe('disproved');
    expect(report.schemaEligible).toBe(false);
    expect(assessmentExitCode(report)).toBe(3);
  });
  it('preserves native-established versus unqualified dated correspondence', async () => {
    const report = await assessSchemaSource('examples/minimal/weather.wsdl', {loading: {policy: {fileRoots: [path.resolve('examples/minimal')]}}});
    expect(report.schema).toBe('established');
    expect(report.correspondence).toBe('inconclusive');
    expect(report.schemaEligible).toBe(false);
    expect(report.operations.length).toBeGreaterThan(0);
    expect(report.operations.every(o => o.capabilities.some(c => c.status === 'unsupported') && o.capabilities.some(c => c.status === 'not-assessed'))).toBe(true);
    expect(assessmentExitCode(report)).toBe(2);
  });
  it('keeps inconclusive RE01 separate from actual failure in an unrelated declaration', async () => {
    const schema = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:complexType name="A"><xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence></xs:complexType><xs:complexType name="B"><xs:complexContent><xs:extension base="t:A"><xs:sequence><xs:element name="b" type="xs:string"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType><xs:complexType name="C"><xs:complexContent><xs:restriction base="t:B"><xs:sequence><xs:element name="a" type="xs:string"/><xs:element name="b" type="xs:string"/></xs:sequence></xs:restriction></xs:complexContent></xs:complexType><xs:complexType name="D"><xs:complexContent><xs:extension base="t:C"><xs:sequence><xs:element name="d" type="xs:string"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType></xs:schema>';
    const report = await altered(schema);
    expect(report.execution).toBe('completed');
    expect(report.schema).toBe('inconclusive');
    expect(report.obligations.some(o => o.rule === 'RE01')).toBe(true);
    const invalid = await altered(schema.replace('</xs:schema>', '<xs:attribute name="unrelated" type="t:A"/></xs:schema>'));
    expect(invalid.schema).toBe('disproved');
    expect(invalid.obligations.some(o => o.status === 'inconclusive')).toBe(true);
  });
  it('reports refused loading, missing references and semantic basis mismatch without admission', async () => {
    const refused = await assess('/etc/passwd');
    expect(refused.execution).toBe('failed');
    expect(refused.schema).toBe('inconclusive');
    const missing = await altered('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:element name="a" type="t:Missing"/></xs:schema>');
    expect(missing.schema).toBe('disproved');
    const mismatch = await assess(path.join(root, 'direct.xsd'), {expectedBasis: 'unqualified-witness'});
    expect(mismatch.schema).toBe('inconclusive');
    expect(mismatch.obligations.some(o => o.rule === 'semantic-basis-match')).toBe(true);
  });
  it('preserves cancellation while controlled source bytes are arriving', async () => {
    const bytes = await readFile(path.join(root, 'direct.xsd'));
    const controller = new AbortController();
    const server = createServer((_request, response) => {
      response.writeHead(200, {'content-type': 'application/xml'});
      response.write(bytes.subarray(0, 40));
      setTimeout(() => {controller.abort(); response.end(bytes.subarray(40));}, 20);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing local port');
    const origin = 'http://127.0.0.1:' + address.port;
    try {
      const report = await assessSchemaSource(origin + '/source.xsd', {signal: controller.signal, loading: {policy: {allowedOrigins: [origin]}}});
      expect(report.execution).toBe('cancelled');
      expect(assessmentExitCode(report)).toBe(5);
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
  });
  it('keeps native cancellation and sticky inclusive request exhaustion distinct', async () => {
    const source = path.join(root, 'direct.xsd');
    const controller = new AbortController(); controller.abort();
    const cancelled = await assess(source, {signal: controller.signal});
    expect(cancelled.execution).toBe('cancelled');
    expect(assessmentExitCode(cancelled)).toBe(5);
    // Find this request's publication boundary, including the configured limit's own diagnostic text.
    // Warm native request IDs beyond their first decimal-width transition.
    for (let i = 0; i < 12; i++) await assess(source);
    let low = 1, high = 64_000_000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const result = await assess(source, {limits: {maxWork: middle}});
      if (result.execution === 'completed') high = middle; else low = middle + 1;
    }
    const at = await assess(source, {limits: {maxWork: high}});
    expect(at.execution).toBe('completed');
    const beyond = await assess(source, {limits: {maxWork: high - 1}});
    expect(beyond.execution).toBe('resource-limit');
    expect(beyond.schemaEligible).toBe(false);
    expect(assessmentExitCode(beyond)).toBe(4);
    expect(beyond.obligations.some(o => o.status === 'inconclusive')).toBe(true);
    const nodeLimit = await assess(source, {limits: {maxNodes: 1}});
    expect(nodeLimit.execution).toBe('resource-limit');
    expect(nodeLimit.usage.nodes).toBeLessThanOrEqual(1);
    const exhausted = await assess(source, {limits: {maxWork: 1}});
    expect(exhausted.execution).toBe('resource-limit');
  });
});
