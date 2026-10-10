/** Descriptive public-schema audit. Counts do not certify schemas or deployment frequency. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { SaxesParser } from 'saxes';

interface Source { group: string; path: string; url: string; gitBlob: string }
interface Manifest { evidenceId: string; scope: string; groups: unknown[]; sources: Source[] }
interface Example { file: string; line: number; element: string; attributes: Record<string, string> }
interface Stats {
    files: number; bytes: number; xmlElements: number; schemas: number;
    features: Record<string, number>; maximumFiniteBound: string;
    finiteAboveEngineRange: Example[]; finiteAboveSafeInteger: Example[];
    zeroMaximum: Example[]; unusualCalendarLiterals: Example[];
    examples: Record<string, Example[]>;
}
interface AttributeUse {
    name: string; declaration?: string; source: string;
    constraint?: 'default' | 'fixed'; lexical?: string;
}
interface Component { key: string; source: string; attributes: AttributeUse[]; groups: string[]; base?: string; derivation?: string }
interface Scope { namespaces: Record<string, string>; targetNamespace: string; attributeForm: string; schema: boolean; xsdKind?: string; component?: Component; path: string }

const directory = resolve('tmp/conformance/realworld');
const manifest = JSON.parse(readFileSync(new URL('./relevance-sources.json', import.meta.url), 'utf8')) as Manifest;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const local = (source: Source) => {
    const path = resolve(directory, source.group, source.path);
    if (relative(directory, path).startsWith('..')) throw new Error('Nonlocal corpus path');
    return path;
};
const unique = [...new Map(manifest.sources.map(source => [source.gitBlob, source])).values()];
if (process.argv.includes('--download')) {
    let cursor = 0, total = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
        while (cursor < unique.length) {
            const source = unique[cursor++], path = local(source);
            if (existsSync(path)) continue;
            if (new URL(source.url).origin !== 'https://raw.githubusercontent.com') throw new Error('Unexpected download origin');
            const response = await fetch(source.url, { signal: AbortSignal.timeout(45000) });
            if (!response.ok || !response.body) throw new Error(source.url + ': HTTP ' + response.status);
            const chunks: Uint8Array[] = []; let bytes = 0;
            for await (const chunk of response.body) {
                bytes += chunk.length; total += chunk.length;
                if (bytes > 8 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('Corpus download byte limit');
                chunks.push(chunk);
            }
            const input = Buffer.concat(chunks);
            const blob = createHash('sha1').update(`blob ${input.length}\0`).update(input).digest('hex');
            if (blob !== source.gitBlob) throw new Error('Pinned Git blob mismatch: ' + source.url);
            mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, input);
        }
    }));
    // Preserve all published URI/path aliases for offline composition experiments.
    const byBlob = new Map(unique.map(source => [source.gitBlob, source]));
    for (const source of manifest.sources) {
        const path = local(source); if (existsSync(path)) continue;
        mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, readFileSync(local(byBlob.get(source.gitBlob)!)));
    }
}

const stats = (): Stats => ({ files: 0, bytes: 0, xmlElements: 0, schemas: 0, features: {}, maximumFiniteBound: '0', finiteAboveEngineRange: [], finiteAboveSafeInteger: [], zeroMaximum: [], unusualCalendarLiterals: [], examples: {} });
const groups: Record<string, Stats> = {};
const components = new Map<string, Component[]>();
const inputs: unknown[] = [];
const namespace = 'http://www.w3.org/2001/XMLSchema';
for (const source of unique) {
    const bytes = readFileSync(local(source));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (blob !== source.gitBlob) throw new Error('Pinned local input changed: ' + source.path);
    const s = groups[source.group] ??= stats(); s.files++; s.bytes += bytes.length;
    const parser = new SaxesParser({ xmlns: true }), scopes: Scope[] = [];
    parser.on('doctype', () => { throw new Error('Corpus DOCTYPE prohibited'); });
    parser.on('opentag', tag => {
        s.xmlElements++;
        const attrs = Object.fromEntries(Object.values(tag.attributes).filter(a => a.uri !== 'http://www.w3.org/2000/xmlns/').map(a => [a.local, a.value]));
        const prior = scopes.at(-1), ns = { ...prior?.namespaces, ...tag.ns };
        const scope: Scope = { namespaces: ns, targetNamespace: prior?.targetNamespace ?? '', attributeForm: prior?.attributeForm ?? 'unqualified', schema: tag.uri === namespace && tag.local === 'schema', xsdKind: tag.uri === namespace ? tag.local : undefined, component: prior?.component, path: (prior?.path ?? '') + '/' + tag.name + ':' + parser.line + ':' + parser.column };
        const qname = (text: string) => { const [a, b] = text.split(':'); return JSON.stringify([b === undefined ? ns[''] ?? '' : ns[a] ?? '?unresolved-prefix:' + a, b ?? a]); };
        const example: Example = { file: source.group + '/' + source.path, line: parser.line, element: tag.local, attributes: attrs };
        const feature = (name: string) => { s.features[name] = (s.features[name] ?? 0) + 1; const examples = s.examples[name] ??= []; if (examples.length < 3) examples.push(example); };
        if (tag.uri === namespace) {
            if (tag.local === 'schema') { scope.targetNamespace = attrs.targetNamespace ?? ''; scope.attributeForm = attrs.attributeFormDefault ?? 'unqualified'; s.schemas++; }
            feature(tag.local);
            for (const name of ['minOccurs', 'maxOccurs']) if (attrs[name] !== undefined) {
                feature(name + ':' + attrs[name]);
                if (/^[+]?[0-9]+$/.test(attrs[name])) {
                    const value = BigInt(attrs[name]);
                    if (value > BigInt(s.maximumFiniteBound)) s.maximumFiniteBound = value.toString();
                    if (value > 2147483647n) s.finiteAboveEngineRange.push(example);
                    if (value > BigInt(Number.MAX_SAFE_INTEGER)) s.finiteAboveSafeInteger.push(example);
                    if (name === 'maxOccurs' && value === 0n) s.zeroMaximum.push(example);
                }
            }
            if (['sequence', 'choice', 'all', 'group'].includes(tag.local) && ((attrs.maxOccurs !== undefined && attrs.maxOccurs !== '1') || (attrs.minOccurs !== undefined && attrs.minOccurs !== '1'))) feature('compositor-nondefault-occurrence');
            for (const name of ['type', 'base', 'itemType']) if (attrs[name]) {
                const key = qname(attrs[name]); feature(name + ':' + key);
                const [uri, type] = JSON.parse(key) as [string, string];
                if (uri === namespace && ['dateTime', 'date', 'time', 'duration', 'gYear', 'gYearMonth', 'gMonth', 'gMonthDay', 'gDay'].includes(type)) feature('calendar-type-reference');
                if (uri === namespace && ['integer', 'long', 'unsignedLong', 'decimal', 'nonNegativeInteger', 'positiveInteger'].includes(type)) feature('precision-sensitive-scalar-reference');
                if (uri === namespace && type === 'QName') feature('QName-type-reference');
            }
            for (const name of ['default', 'fixed']) if (attrs[name] !== undefined) {
                feature('constraint:' + name);
                if (/^-\d{4,}-|T\d\d:\d\d:60(?:[.Z+-]|$)/.test(attrs[name])) s.unusualCalendarLiterals.push(example);
            }
            if (tag.local === 'attribute' && attrs.use === 'prohibited') feature('attribute-prohibited');
            if (tag.local === 'complexType' || (tag.local === 'attributeGroup' && attrs.name && prior?.schema)) {
                const component: Component = { key: JSON.stringify([attrs.name ? scope.targetNamespace : '#anonymous', attrs.name ?? example.file + scope.path]), source: example.file + scope.path, attributes: [], groups: [] };
                scope.component = component;
                const values = components.get(component.key) ?? []; values.push(component); components.set(component.key, values);
            }
            if (['extension', 'restriction'].includes(tag.local) && attrs.base && scope.component && ['complexContent', 'simpleContent'].includes(prior?.xsdKind ?? '')) { scope.component.base = qname(attrs.base); scope.component.derivation = tag.local; }
            if (tag.local === 'attributeGroup' && attrs.ref && scope.component) scope.component.groups.push(qname(attrs.ref));
            if (tag.local === 'attribute') {
                const global = prior?.schema;
                if (global) feature('global-attribute');
                if (attrs.ref) feature('attribute-reference');
                const use: AttributeUse = { name: attrs.ref ? qname(attrs.ref) : JSON.stringify([global || (attrs.form ?? scope.attributeForm) === 'qualified' ? scope.targetNamespace : '', attrs.name ?? '?']), declaration: attrs.ref ? qname(attrs.ref) : global ? JSON.stringify([scope.targetNamespace, attrs.name]) : undefined, source: example.file + scope.path, constraint: attrs.fixed !== undefined ? 'fixed' : attrs.default !== undefined ? 'default' : undefined, lexical: attrs.fixed ?? attrs.default };
                if (!global && scope.component && attrs.use !== 'prohibited') scope.component.attributes.push(use);
            }
        }
        scopes.push(scope);
    });
    parser.on('closetag', () => { scopes.pop(); });
    parser.write(bytes.toString('utf8')).close();
    inputs.push({ ...source, bytes: bytes.length, sha256: digest(bytes), aliases: manifest.sources.filter(s => s.gitBlob === source.gitBlob).map(s => ({ group: s.group, path: s.path })) });
}

const effective = (component: Component, active = new Set<string>()): { uses: AttributeUse[]; unresolved: string[] } => {
    if (active.has(component.key)) return { uses: [], unresolved: ['cyclic-screen:' + component.key] };
    const next = new Set(active).add(component.key), uses = [...component.attributes], unresolved: string[] = [];
    const targets = [...component.groups, ...(component.derivation === 'extension' && component.base ? [component.base] : [])];
    for (const key of targets) {
        if (key.startsWith('["' + namespace + '"')) continue;
        const candidates = components.get(key);
        if (candidates?.length !== 1) { unresolved.push(key); continue; }
        const result = effective(candidates[0], next); uses.push(...result.uses); unresolved.push(...result.unresolved);
    }
    return { uses: [...new Map(uses.map(u => [u.source, u])).values()], unresolved };
};
const collisions: unknown[] = [], unresolvedExtensions: unknown[] = [];
let screenedExtensions = 0;
for (const values of components.values()) for (const component of values) {
    if (component.derivation !== 'extension') continue;
    const result = effective(component); screenedExtensions++;
    if (result.unresolved.length) unresolvedExtensions.push({ source: component.source, references: result.unresolved });
    const names = new Map<string, AttributeUse[]>();
    for (const use of result.uses) { const prior = names.get(use.name) ?? []; prior.push(use); names.set(use.name, prior); }
    for (const [name, uses] of names) if (uses.length > 1) collisions.push({ source: component.source, name, uses, unresolved: result.unresolved });
}
const report = { evidenceId: manifest.evidenceId, scope: manifest.scope, node: process.version, platform: process.platform, groups: manifest.groups, summary: groups, inputs,
    extensionAttributeScreen: { screenedExtensions, potentialDuplicateNames: collisions, unresolved: unresolvedExtensions, limitations: 'Descriptive screen of unique-name-resolved extension/group chains, including anonymous extension types. Ambiguous/missing imports, restriction composition and value-space equivalence are not fully assessed; this is not an AU or XSD validator.' },
    interpretationLimits: ['No live production service or customer payload was accessed.', 'Purposive published-schema sample cannot estimate market prevalence or prove absence elsewhere.', 'Finite occurrence counts describe declarations; unbounded is separate, and large scalar values are a separate domain.', 'Absence of BCE/leap-second defaults does not exclude such instance values from xs:dateTime.', 'Repeated copies are counted once per Git blob for descriptive totals; URI aliases remain explicit.'] };
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'relevance-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: Object.fromEntries(Object.entries(groups).map(([id, s]) => [id, { files: s.files, bytes: s.bytes, xmlElements: s.xmlElements, maximumFiniteBound: s.maximumFiniteBound, hugeBounds: s.finiteAboveEngineRange.length, zeroMaximum: s.zeroMaximum.length, unusualCalendarLiterals: s.unusualCalendarLiterals.length, featureCounts: Object.fromEntries(Object.entries(s.features).filter(([key]) => ['complexType', 'extension', 'restriction', 'attributeGroup', 'attribute', 'attribute-reference', 'global-attribute', 'compositor-nondefault-occurrence', 'constraint:default', 'constraint:fixed', 'attribute-prohibited', 'maxOccurs:unbounded', 'calendar-type-reference', 'precision-sensitive-scalar-reference', 'QName-type-reference'].includes(key))) }])), screenedExtensions, potentialDuplicateNames: collisions.length, unresolvedExtensions: unresolvedExtensions.length }, null, 2));
