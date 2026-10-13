/** Reproducible scalar-completeness calibration; no universal RE01 claims. */
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget, DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import type {RawScalarFacetComponent, RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const fixture = 'test/conformance/fixtures/xsd/recovery/scalar-completeness-review.xsd';
const namespace = 'urn:recovery:scalar-completeness-review';
const named = (local: string): Reference => ({kind: 'local', target: globalId('type', {namespace, local})});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
export const SCALAR_CAPACITY_LIMITS = {
  default: {maxNodes: DEFAULT_MAX_NODES, maxWork: DEFAULT_MAX_WORK},
  legacy: {maxNodes: 100_000, maxWork: 1_000_000},
  previous: {maxNodes: 100_000, maxWork: 25_000_000},
  diagnostic: {maxNodes: 100_000, maxWork: 250_000_000},
};
type Profile = keyof typeof SCALAR_CAPACITY_LIMITS;
type Definition = RawSimpleTypeProperties & {base: Reference};
const workloads = ['length-positive', 'length-widening', 'decimal-bound', 'uri-length', 'ieee-bound', 'ieee-alias',
  'calendar-bound', 'calendar-alias', 'duration-bound', 'duration-alias', 'qname-alias', 'base64-shadow', 'base64-exponent-embedding',
  'list-decimal-string', 'list-decimal-ieee', 'list-double-widening', 'string-negative-exponent-positive',
  'float-double-positive', 'float-double-widening', 'double-float-positive', 'double-float-widening',
  'string-negative-exponent-widening', 'uri-negative-exponent-positive', 'uri-negative-exponent-widening', 'adversarial-pattern'] as const;
type Workload = typeof workloads[number];

export async function measureScalarCapacity(workload: Workload, profile: Profile) {
  const limits = SCALAR_CAPACITY_LIMITS[profile], budget = createSemanticBudget(limits);
  const wall = performance.now(), memory = process.memoryUsage();
  const input = await loadSemanticSchemaInput(path.resolve(fixture), {policy: {fileRoots: [path.resolve('test/conformance/fixtures')]}});
  const prepared = prepareSourceSchemaRequest(input, {budget});
  if (prepared.kind !== 'prepared') throw new Error('Source preparation must fit every measurement profile');
  const found = prepared.request.actual.lookup(globalId('type', {namespace, local: 'Template'}));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Missing source template');
  const seed = found.node, definitions: Definition[] = [];
  const facet = (name: string, value: string, operandType?: Reference, fixed = false): RawScalarFacetComponent => ({annotation: 'absent', facets: [{name, fixed,
    lexical: {value, context: seed.context}, ...(operandType ? {operand: {type: operandType, owner, context: 'original' as const}} : {})}]});
  const raw = (local: string, base: Reference, components: readonly RawScalarFacetComponent[], variety: RawSimpleTypeProperties['variety'] = {kind: 'atomic'}) => {
    definitions.push({type: globalId('type', {namespace, local}), base, final: [], variety, facetComponentSet: components,
      provenance: {kind: 'hypothetical-abstract', originals: []}});
  };
  const whitespace = facet('whiteSpace', 'collapse', undefined, true);
  let expected = 'checked';
  if (workload === 'length-positive' || workload === 'length-widening' || workload === 'uri-length') {
    const primitive = workload === 'uri-length' ? 'anyURI' : 'string', pattern = facet('pattern', workload === 'length-widening' ? 'a+' : '[a-z]{5,}');
    raw('Base', builtin(primitive), [facet('minLength', '3'), facet('minLength', '5'), pattern]);
    raw('Child', named('Base'), [facet('minLength', '3'), pattern]);
    if (workload === 'length-widening') expected = 'invalid-schema';
  } else if (['decimal-bound', 'ieee-bound', 'calendar-bound', 'duration-bound'].includes(workload)) {
    const specification = workload === 'calendar-bound'
      ? {primitive: 'dateTime', strict: '2005-01-01T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '201[0-9]-01-01T00:00:00([.]0+)?Z'}
      : workload === 'duration-bound' ? {primitive: 'duration', strict: 'P1M', loose: 'P1D', pattern: 'P0*32D'}
        : {primitive: workload === 'decimal-bound' ? 'decimal' : 'float', strict: '5', loose: '1', pattern: '0*[6-9]([.]0*)?'};
    const retained = [facet('minExclusive', specification.loose), facet('pattern', specification.pattern)];
    raw('Base', builtin(specification.primitive), [facet('minExclusive', specification.strict), ...retained]);
    raw('Child', named('Base'), retained);
  } else if (['ieee-alias', 'calendar-alias', 'duration-alias', 'qname-alias'].includes(workload)) {
    const specification = workload === 'ieee-alias' ? {primitive: 'double', pattern: '0+1[.]0+E\\-0*0', value: '1'}
      : workload === 'calendar-alias' ? {primitive: 'dateTime', pattern: '2001-12-31T23:59:60[.]250+Z', value: '2002-01-01T00:00:00.25Z'}
        : workload === 'duration-alias' ? {primitive: 'duration', pattern: 'P0+Y0*12M', value: 'P1Y'}
          : {primitive: 'QName', pattern: 'q:item', value: 'p:item'};
    const pattern = facet('pattern', specification.pattern);
    raw('Base', builtin(specification.primitive), [pattern]);
    raw('Child', named('Base'), [pattern, facet('enumeration', specification.value, builtin(specification.primitive))]);
  } else if (workload.startsWith('float-double-') || workload.startsWith('double-float-')) {
    const first = workload.startsWith('float-') ? 'float' : 'double', later = first === 'float' ? 'double' : 'float';
    const positive = workload.endsWith('positive'), retained = positive ? [facet('pattern', '[6-9]+')] : [];
    const baseMembers = [named('First'), builtin(later)], childMembers = [named('NarrowFirst'), builtin(later)];
    raw('First', builtin(first), [facet('minExclusive', '0')]);
    raw('NarrowFirst', named('First'), [facet('minExclusive', '2')]);
    raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers});
    raw('Base', named('Root'), retained, {kind: 'union', members: baseMembers});
    raw('Child', named('Base'), retained, {kind: 'union', members: childMembers});
    if (!positive) expected = 'invalid-schema';
  } else if (workload === 'list-decimal-string') {
    raw('AboveSeven', named('AboveFive'), [facet('minExclusive', '7')]);
    raw('AboveSevenList', named('AboveFiveList'), [whitespace], {kind: 'list', item: named('AboveSeven')});
    raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: [named('AboveFiveList'), named('NumericThenTextList')]});
    raw('Child', named('Base'), [], {kind: 'union', members: [named('AboveSevenList'), named('NumericThenTextList')]});
  } else if (workload === 'list-decimal-ieee' || workload === 'list-double-widening') {
    const item = {kind: 'union' as const, members: [builtin('decimal'), builtin('float')]}, list = {kind: 'list' as const, item: named('NumericItem')};
    const later = workload === 'list-double-widening' ? named('DoubleList') : named('LaterList');
    raw('NumericItem', builtin('anySimpleType'), [], item); raw('FirstList', builtin('anySimpleType'), [whitespace], list);
    raw('LaterList', builtin('anySimpleType'), [whitespace], list);
    raw('NarrowList', named('FirstList'), [whitespace, facet('pattern', workload === 'list-double-widening' ? 'a*' : '[6-9]+( [6-9]+)*')], list);
    raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: [named('FirstList'), later]});
    raw('Child', named('Base'), [], {kind: 'union', members: [named('NarrowList'), later]});
    if (workload === 'list-double-widening') expected = 'invalid-schema';
  } else if (workload === 'adversarial-pattern') {
    const pattern = facet('pattern', '[a-z]{50000000,}');
    raw('Base', builtin('string'), [facet('minLength', '3'), facet('minLength', '5'), pattern]);
    raw('Child', named('Base'), [facet('minLength', '3'), pattern]); expected = 'resource-limit';
  } else {
    const binary = workload.startsWith('base64'), positive = workload.endsWith('positive') || workload === 'base64-exponent-embedding';
    const primitive = binary ? 'base64Binary' : workload.startsWith('uri-') ? 'anyURI' : 'string';
    const pattern = binary ? workload === 'base64-shadow' ? '1+( 1+)*' : '1 *e1( *1)+'
      : positive ? '[3-9]e\\-0*1( [3-9]e\\-0*1)*' : '1e\\-0*3( 1e\\-0*3)*';
    const retained = facet('pattern', pattern), baseMembers = [named('FirstList'), builtin(primitive)], childMembers = [named('NarrowList'), builtin(primitive)];
    raw('FirstItem', builtin('float'), [facet('minExclusive', '0')]);
    raw('NarrowItem', named('FirstItem'), [facet('minExclusive', positive && !binary ? '0.2' : '2')]);
    raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')});
    raw('NarrowList', named('FirstList'), [whitespace], {kind: 'list', item: named('NarrowItem')});
    raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers});
    raw('Base', named('Root'), [retained], {kind: 'union', members: baseMembers});
    raw('Child', named('Base'), [retained], {kind: 'union', members: childMembers});
    if (!positive) expected = 'invalid-schema';
  }
  const additions: SimpleTypeNode[] = definitions.map(definition => ({...seed, id: definition.type,
    identity: {kind: 'global', role: 'type', name: {namespace, local: JSON.parse(definition.type)[3] as string}},
    variety: {kind: 'restriction', base: definition.base, facets: []}}));
  const candidate = prepared.request.candidate({key: 'scalar-capacity', active: [...prepared.request.actual.members, ...additions.map(node => node.id)], additions, rawSimpleTypes: definitions});
  if (candidate.kind !== 'prepared') throw new Error('Candidate preparation must fit every measurement profile');
  const kernel = createSchemaScalarKernel(candidate.context), before = {...budget.usage()}, queryWall = performance.now(), queryMemory = process.memoryUsage();
  const result = kernel.describe(named('Child'), owner), after = {...budget.usage()};
  const query = {work: after.work - before.work, wallMs: performance.now() - queryWall, memoryBefore: queryMemory, memoryAfter: process.memoryUsage()};
  let invoked = false; const retry = result.kind === 'resource-limit' ? budget.guard(() => {invoked = true;}) : undefined;
  if (result.kind !== expected && result.kind !== 'resource-limit') throw new Error(`Unexpected ${workload} result: ${result.kind}`);
  if (result.kind === 'checked' && result.obligations.length) throw new Error(`Unresolved ${workload} obligations`);
  return {workload, profile, expected, kind: result.kind, usage: after, query,
    totalWallMs: performance.now() - wall, memoryBefore: memory, memoryAfter: process.memoryUsage(), peakRssKiB: process.resourceUsage().maxRSS,
    stickyExhaustion: result.kind === 'resource-limit' ? !invoked && retry === budget.failure() && after.work === budget.usage().work : undefined};
}
function digests() {
  const files: string[] = [];
  for (const directory of ['src/compiler', 'src/loader']) for (const entry of readdirSync(directory)) if (entry.endsWith('.ts')) files.push(directory + '/' + entry);
  files.push(fixture, fileURLToPath(import.meta.url), 'package-lock.json');
  return Object.fromEntries(files.sort().map(file => [path.relative(process.cwd(), path.resolve(file)).split(path.sep).join('/'), createHash('sha256').update(readFileSync(file)).digest('hex')]));
}
async function main() {
  const arg = (name: string) => {const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1];};
  const profile = arg('--profile'); if (!profile || !(profile in SCALAR_CAPACITY_LIMITS)) throw new Error('Pass --profile default, legacy, previous or diagnostic');
  const selected = arg('--workload'); if (selected && !workloads.includes(selected as Workload)) throw new Error('Unknown workload');
  if (process.argv.includes('--worker')) {
    if (!selected) throw new Error('Worker requires --workload');
    const rows = []; for (let iteration = 0; iteration < 3; iteration++) rows.push({iteration, ...await measureScalarCapacity(selected as Workload, profile as Profile)});
    process.stdout.write(JSON.stringify(rows)); return;
  }
  const sourceDigests = digests(), results = [];
  for (const workload of workloads.filter(workload => !selected || selected === workload)) {
    process.stderr.write(`Measuring ${workload} ${profile}\n`);
    const output = execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker', '--profile', profile, '--workload', workload],
      {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000});
    results.push(...JSON.parse(output) as unknown[]);
  }
  if (JSON.stringify(sourceDigests) !== JSON.stringify(digests())) throw new Error('Sources changed during measurement');
  process.stdout.write(JSON.stringify({format: 'scalar-capacity-v1', revision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), sourceDigests,
    node: process.version, platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model, profile, limits: SCALAR_CAPACITY_LIMITS[profile as Profile],
    collection: 'Each workload/profile has a fresh child and three fresh authenticated requests. First-call and warm process samples retain independent request budgets. Query work excludes source/candidate preparation; usage includes it. RSS/heap snapshots are observations, not allocation totals; RSS high-water is process lifetime. Time includes JIT/GC/OS noise. Only local scalar completeness is measured; no universal RE01 or production activation claim.', results}, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
