/** Compact, attributable research record; never an expected-answer generator. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { verifyProvenance } from './provenance.js';
import type { RunProvenance } from './provenance.js';

interface Stats {
    files: number; bytes: number; xmlElements: number; schemas: number;
    features: Record<string, number>; maximumFiniteBound: string;
    finiteAboveEngineRange: unknown[]; finiteAboveSafeInteger: unknown[];
    zeroMaximum: unknown[]; unusualCalendarLiterals: unknown[];
}
interface Input { group: string; path: string; gitBlob: string; bytes: number; sha256: string }
interface Audit {
    provenance?: RunProvenance;
    evidenceId: string; scope: string; node: string; platform: string; groups: unknown[];
    summary: Record<string, Stats>; inputs: Input[]; interpretationLimits: string[];
    extensionAttributeScreen: { screenedExtensions: number; potentialDuplicateNames: unknown[]; unresolved: unknown[]; limitations: string };
}
interface Probes {
    provenance?: RunProvenance;
    evidenceId: string; node: string; platform: string;
    inputs: Record<string, { path: string; sha256: string }>;
    observations: Record<string, unknown>; limits: string[];
}
interface PrimaryRecheck {
    provenance?: RunProvenance;
    testedRevision: string; testedTree: string; workingTreeDirty: boolean; node: string; platform: string;
    summary: Record<string, number>;
}
const directory = resolve('tmp/conformance/realworld');
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(directory, name), 'utf8')) as T;
const audit = read<Audit>('relevance-report.json'), probes = read<Probes>('relevance-probes.json');
const recheckPath = 'tmp/conformance/node-qualification/report.json';
const recheck = JSON.parse(readFileSync(recheckPath, 'utf8')) as PrimaryRecheck;
verifyProvenance(audit.provenance);
verifyProvenance(probes.provenance);
verifyProvenance(recheck.provenance);
if (recheck.node !== process.version || recheck.platform !== process.platform)
    throw new Error('Primary recheck and recorder environments differ');
for (const [name, count] of Object.entries({ baselineSchemas: 14, baselineInstances: 40, pwSchemas: 38, pwInstances: 8, additionalInstances: 113, additionalTotal: 113 }))
    if (recheck.summary[name] !== count) throw new Error('Primary recheck mismatch: ' + name);
if (audit.node !== process.version || probes.node !== process.version || audit.platform !== process.platform || probes.platform !== process.platform)
    throw new Error('Research run and recorder environments differ');
const files = [
    'test/conformance/reference/qualification/relevance.ts',
    'test/conformance/reference/qualification/relevance-probes.ts',
    'test/conformance/reference/qualification/relevance-record.ts',
    'test/conformance/reference/qualification/relevance-sources.json',
    'test/conformance/reference/qualification/probe.ts',
    'test/conformance/reference/qualification/primary-checks.ts',
    'test/conformance/reference/qualification/primary-corpus.ts',
    'test/conformance/reference/qualification/observations.json',
    'test/conformance/reference/validate.test.ts',
    'test/conformance/semantic-baseline.json',
    'test/conformance/s06-research-manifest.json',
    'test/conformance/fixtures/xsd/s06-pw01/expectations.json',
    'test/conformance/reference/adapter.ts',
    'test/conformance/reference/primary.ts',
    'test/conformance/reference/primary-worker.ts',
    'test/conformance/reference/xml-input.ts',
    'src/cli.ts', 'src/pipeline.ts', 'src/compiler/schemaCompiler.ts',
    'src/compiler/semanticCatalog.ts', 'src/compiler/resolveCanonicalGraph.ts',
    'src/compiler/occurrenceAnalysis.ts', 'src/compiler/catalogProvenance.ts',
    'src/loader/schemaResources.ts', 'src/xsd/primitives.ts',
    'test/conformance/fixtures/soap/content-model/probe.wsdl',
    'test/conformance/fixtures/soap/content-model/ordered.xml',
    'test/conformance/fixtures/soap/content-model/name-keyed-invalid.xml',
];
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const relevantFeatures = new Set(['complexType', 'extension', 'restriction', 'attributeGroup', 'attribute', 'attribute-reference', 'global-attribute', 'compositor-nondefault-occurrence', 'constraint:default', 'constraint:fixed', 'attribute-prohibited', 'maxOccurs:unbounded', 'calendar-type-reference', 'precision-sensitive-scalar-reference', 'QName-type-reference']);
const record = {
    evidenceId: 'NT-T06-R', recordedAt: new Date().toISOString(),
    revision: probes.provenance.testedRevision, tree: probes.provenance.testedTree,
    dirty: probes.provenance.workingTreeDirty,
    node: process.version, platform: process.platform,
    sourceHashes: probes.provenance.sourceHashes,
    provenance: { audit: audit.provenance, probes: probes.provenance, primary: recheck.provenance },
    engine: { package: 'libxml2-wasm', version: JSON.parse(readFileSync('node_modules/libxml2-wasm/package.json', 'utf8')).version as string, artifact: 'lib/libxml2raw.mjs', artifactSha256: sha256('node_modules/libxml2-wasm/lib/libxml2raw.mjs') },
    audit: {
        evidenceId: audit.evidenceId, scope: audit.scope, groups: audit.groups,
        summary: Object.fromEntries(Object.entries(audit.summary).map(([name, s]) => [name, {
            uniqueFiles: s.files, bytes: s.bytes, xmlElements: s.xmlElements, schemas: s.schemas,
            maximumFiniteOccurrence: s.maximumFiniteBound,
            finiteAboveEngineRange: s.finiteAboveEngineRange.length,
            finiteAboveSafeInteger: s.finiteAboveSafeInteger.length,
            zeroMaximum: s.zeroMaximum.length, unusualCalendarDefaultsOrFixed: s.unusualCalendarLiterals.length,
            features: Object.fromEntries(Object.entries(s.features).filter(([name]) => relevantFeatures.has(name))),
        }])),
        inputs: audit.inputs.map(({ group, path, gitBlob, bytes, sha256 }) => ({ group, path, gitBlob, bytes, sha256 })),
        extensionAttributeScreen: {
            screenedExtensions: audit.extensionAttributeScreen.screenedExtensions,
            potentialDuplicateNames: audit.extensionAttributeScreen.potentialDuplicateNames,
            unresolvedExtensions: audit.extensionAttributeScreen.unresolved.length,
            limitations: audit.extensionAttributeScreen.limitations,
            conclusion: 'Incomplete descriptive screen cannot establish absence or prevalence of conflicting attribute-use cases.',
        },
        interpretationLimits: audit.interpretationLimits,
    },
    probes: { ...probes, inputs: Object.fromEntries(Object.entries(probes.inputs).map(([name, input]) => [name, { path: relative(resolve('.'), input.path), sha256: input.sha256 }])) },
    primaryRecheck: {
        testedRevision: recheck.testedRevision, testedTree: recheck.testedTree, workingTreeDirty: recheck.workingTreeDirty,
        summary: recheck.summary, rawReportSha256: sha256(recheckPath),
        boundaries: JSON.parse(readFileSync('tmp/conformance/node-qualification/primary-boundaries.json', 'utf8')) as unknown,
        limitations: 'Fresh measured Linux Node 24 recheck; historical observations.json remains attributed to its original run. No Gate S or final platform-matrix claim.',
    },
    codeReview: [
        { source: 'src/compiler/schemaCompiler.ts:readOccurrence', finding: 'The current public legacy projection converts occurrence counts with Number; arbitrary exact counts are not an existing public guarantee.' },
        { source: 'src/xsd/primitives.ts', finding: 'String-first scalar handling separates exact integer/decimal values from particle occurrence counts; financial scalar precision must remain protected.' },
        { source: 'src/compiler/schemaCompiler.ts:rejectUnsupportedSchemaConstructs', finding: 'Abstract types, substitution groups and expectedContentTypes already trigger public generation guards.' },
        { source: 'src/compiler/schemaCompiler.ts:collectAttributes', finding: 'The public legacy attribute projection does not perform full typed default/fixed augmentation.' },
        { source: 'src/compiler/semanticCatalog.ts:prepareResolvedCompilationInput', finding: 'The internal faithful path charges structural data before retention; it is separate from the public legacy generator.' },
        { source: 'src/compiler/occurrenceAnalysis.ts', finding: 'Exact bounded interval analysis returns requires-schema-assessment, not a complete content-language validity proof.' },
    ],
    interpretation: [
        'No sampled declaration exceeded the primary occurrence guard; this supports prioritization, not a reduction of the exact research domain.',
        'Large WSDL input and faithful work budgets are observed limits, not theoretical scenarios; raising a budget does not establish schema validity.',
        'The unmodified SDK WSDL reached independent schema construction under explicit larger input limits and was rejected for maxOccur spelling; it did not qualify instances.',
        'The Travelport canonical structure has 3562 nodes, below the node limit, but large retained syntax/provenance makes data charging exceed both tested work budgets.',
        'Defaults, restrictions, dates, QName references and precise scalar types appear in the sample, so those replacement contracts remain necessary.',
        'No evidence here demonstrates that a current production API requires Python rather than an adequately implemented Node path.',
        'Gate S accepts NT-CONT-01 through maintainer comment 6098237195; #232/#234 proof obligations and all public guards remain unchanged.',
    ],
};
if (record.engine.version !== '0.7.2') throw new Error('Unexpected reference package');
writeFileSync(resolve(directory, 'recorded-observations.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ evidenceId: record.evidenceId, files: audit.inputs.length, sourceHashes: Object.keys(record.sourceHashes).length, dirty: record.dirty }));
