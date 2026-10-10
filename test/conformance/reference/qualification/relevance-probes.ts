/** Production observations and bounded Node feasibility, separate from expected-answer authority. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadWsdl } from '../../../../src/loader/wsdlLoader.js';
import { compileCatalog } from '../../../../src/compiler/schemaCompiler.js';
import { resolveCompilerOptions } from '../../../../src/config.js';
import { prepareCompilationInput, prepareResolvedCompilationInput } from '../../../../src/compiler/semanticCatalog.js';
import { analyzeOccurrences } from '../../../../src/compiler/occurrenceAnalysis.js';
import { countSemanticData, semanticBudget } from '../../../../src/compiler/resolveCanonicalGraph.js';
import { isolated } from '../primary.js';
import type { Request } from '../primary-worker.ts';
import { validateFixture } from '../adapter.js';

const root = resolve('tmp/conformance/realworld');
const ebay = resolve(root, 'ebay/eBaySvc.wsdl');
const onvif = resolve(root, 'onvif/wsdl/ver10/schema/onvif.xsd');
const travelport = resolve(root, 'travelport/ConsoleApplication1/ConsoleApplication1/Wsdl/hotel_v40_0/Hotel.xsd');
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const errors = (error: unknown) => ({ name: error instanceof Error ? error.name : typeof error, diagnostic: String(error), category: error && typeof error === 'object' && 'category' in error ? error.category : undefined });
const primary: Request = { candidateRoot: resolve('.'), uri: 'fixture:///ebay/eBaySvc.wsdl', schema: readFileSync(ebay, 'utf8'), instances: ['<GeteBayOfficialTimeRequest xmlns="urn:ebay:apis:eBLBaseComponents"/>', '<notInSchema xmlns="urn:ebay:apis:eBLBaseComponents"/>'], resources: {} };
const observations: Record<string, unknown> = {};
observations.ebayDefaultReferenceBudget = await isolated(primary);
observations.ebayIncreasedTotalOnly = await isolated({ ...primary, maxBytes: 8 * 1024 * 1024 });
observations.ebayExplicitLargerExtraction = await isolated({ ...primary, maxBytes: 8 * 1024 * 1024, schemaMaxBytes: 8 * 1024 * 1024 }, 15000);
observations.soapOrderControl = await validateFixture('soap/content-model/probe.wsdl', ['ordered.xml', 'name-keyed-invalid.xml'].map(name => readFileSync(resolve('test/conformance/fixtures/soap/content-model', name), 'utf8').trim()));
try {
    const input = await prepareCompilationInput({ kind: 'source', source: travelport }, { mode: 'faithful', loading: { policy: { fileRoots: [root] } } });
    if (input.kind === 'semantic') {
        const budget = semanticBudget({ maxSteps: 32000000 });
        countSemanticData(input.catalog.graph, budget);
        observations.travelportLoadedStructure = { graphNodes: input.catalog.graph.nodes.length, loadingEdges: input.catalog.graph.loading.edges.length, serializedCatalogBytes: Buffer.byteLength(JSON.stringify(input.catalog)), gatheringSteps: budget.steps, measurementLimit: 32000000 };
    } else observations.travelportLoadedStructure = { outcome: input.kind };
} catch (error) { observations.travelportLoadedStructure = errors(error); }
for (const [name, path] of [['ebay', ebay], ['onvif', onvif], ['travelportHotel', travelport]] as const) {
    for (const steps of [1000000, 16000000]) {
        const started = performance.now();
        try {
            const input = await prepareResolvedCompilationInput({ kind: 'source', source: path }, { loading: { policy: { fileRoots: [root] } }, semantics: { maxSteps: steps } });
            if (input.kind !== 'semantic') throw new Error('Expected internal semantic input');
            const analysis = analyzeOccurrences(input.composed, { maxSteps: steps });
            observations[name + ':internal-semantic:' + steps] = { outcome: analysis.kind, graphNodes: input.catalog.graph.nodes.length, loadingEdges: input.catalog.graph.loading.edges.length, gathering: input.gathering, analysis: analysis.kind === 'analyzed' ? { steps: analysis.analysis.metrics.steps, assessment: analysis.analysis.assessment } : errors(analysis.diagnostic), milliseconds: performance.now() - started };
        } catch (error) {
            observations[name + ':internal-semantic:' + steps] = { ...errors(error), milliseconds: performance.now() - started };
        }
    }
}
try {
    const wsdl = await loadWsdl(ebay);
    const catalog = compileCatalog(wsdl, resolveCompilerOptions({}, { wsdl: ebay, out: '' }));
    observations.ebayPublicLegacyCompiler = { outcome: 'compiled', types: catalog.types.length, operations: catalog.operations.length };
} catch (error) { observations.ebayPublicLegacyCompiler = errors(error); }
const report = { evidenceId: 'NT-T06-R2', node: process.version, platform: process.platform,
    inputs: { ebay: { path: ebay, sha256: digest(ebay) }, onvif: { path: onvif, sha256: digest(onvif) }, travelportHotel: { path: travelport, sha256: digest(travelport) } }, observations,
    limits: ['No live endpoint or production payload was accessed.', 'Budget experiments do not change product defaults or discharge schema assessment.', 'The explicit extraction override is a test-only experiment; the default reference policy remains unchanged.', 'Internal faithful analysis is separate from public legacy generation.', 'Schema acceptance and two selected instances do not qualify every API operation or service.'] };
writeFileSync(resolve(root, 'relevance-probes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.observations, null, 2));
