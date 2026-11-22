import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {CheckedComponentOptions, planCheckedComponents} from '../../src/index.js';
import {encoderRoutes, media} from './onvif-media-wire.js';

export const binding = {namespace: media, local: 'MediaBinding'};
export const selector = (operation: string) => ({operation, portType: {namespace: media, local: 'Media'}, binding});
export const publishedSha256 = '9d8365f7b78de0df99a625b39bd2d15b16e9ac766459b8dc6df845641fdf5912';

interface SurveyIdentity {
  archiveSha256: string;
  gitTree?: string;
  onvifRevision: string;
  pinManifestSha256: string;
  surveyWrapperSha256: string;
}
export interface WireResult {
  operation: string;
  case: string;
  status: number;
  dispatches: number;
  passed: boolean;
}

export async function surveyMedia(plan: typeof planCheckedComponents, source: string, choices: Partial<CheckedComponentOptions>,
  fetchCount: () => number, identity: SurveyIdentity, wire: WireResult[], evidence: string, baseline?: string) {
  const save = (file: string, value: unknown) => writeFile(path.join(evidence, file), JSON.stringify(value, null, 2) + '\n');
  const scope = 'lax-wildcard-operation-v1';
  const scoped = {...choices, qualificationScope: scope} as const;
  const discovery = await plan(source, {...scoped, selectors: [selector('GetSnapshotUri')]});
  assert.ok(discovery.ready && discovery.inventory.complete);
  const names = discovery.operations.map(item => item.operation).sort();
  assert.equal(names.length, 79);
  assert.equal(new Set(names).size, 79);
  assert.equal(fetchCount(), 0);
  const rows = [];
  for (const operation of names) {
    const current = selector(operation), before = fetchCount();
    const report = operation === 'GetSnapshotUri' ? discovery : await plan(source, {...scoped, selectors: [current]});
    assert.equal(report.inventory.operations, names.length);
    assert.equal(report.executed, false);
    assert.deepEqual(report.selection?.selectors, [current]);
    assert.deepEqual(report.operations.filter(item => item.selected).map(item => item.operation), [operation]);
    rows.push({operation, selector: current, selected: true, ready: report.ready, metadataFetches: fetchCount() - before,
      blockers: report.blockers.map(({category, stage, dimension, reason, schema}) => ({category, stage, dimension, reason, schema}))});
    if (rows.length % 10 === 0) console.log('Planned', rows.length, 'of', names.length);
  }
  assert.equal(fetchCount(), 0);
  const report = {...identity, scope, binding, rows, wire};
  await save('planning-results.json', report);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.ready ? 'ready' : row.blockers[0]!.reason;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  console.log(counts);
  if (!baseline) {
    assert.deepEqual(counts, {ready: 41, 'native-component-shape': 21, 'operation-source-qualification:cos-nonambig': 13,
      'operation-correspondence:scalar-correspondence-scope': 4});
    return;
  }
  const previous = JSON.parse(await readFile(path.join(baseline, 'planning-results.json'), 'utf8')) as typeof report;
  assert.equal(previous.archiveSha256, publishedSha256);
  for (const key of ['scope', 'onvifRevision', 'pinManifestSha256', 'surveyWrapperSha256'] as const) assert.equal(previous[key], report[key], key);
  assert.deepEqual(previous.rows.map(row => row.selector), rows.map(row => row.selector));
  type Row = typeof rows[number];
  const stage = (row: Row, results: WireResult[]) => results.some(item =>
    item.operation === row.operation && item.case === 'success' && item.passed) ? 'installed-http-soap' : row.ready ? 'planning-ready' : 'planning-refused';
  const compared = rows.map((candidate, index) => {
    const baseline = previous.rows[index]!;
    return {operation: candidate.operation, baseline, candidate, baselineStage: stage(baseline, previous.wire), candidateStage: stage(candidate, wire)};
  });
  const newlyReady = compared.filter(row => !row.baseline.ready && row.candidate.ready).map(row => row.operation);
  const newlyRefused = compared.filter(row => row.baseline.ready && !row.candidate.ready).map(row => row.operation);
  await save('comparison.json', {...identity, baselineSha256: previous.archiveSha256, binding, scope, newlyReady, newlyRefused, rows: compared});
  const first = (row: Row) => row.blockers[0];
  const fields = (row: Row, highest: string) => [highest, first(row)?.category, first(row)?.stage, first(row)?.reason,
    first(row)?.schema?.rule, first(row)?.schema?.component?.local, row.metadataFetches];
  const csv = (cells: unknown[]) => cells.map(cell => '"' + String(cell ?? '').replaceAll('"', '""') + '"').join(',');
  const columns = ['highest_stage', 'first_category', 'first_stage', 'first_reason', 'first_rule', 'first_component', 'metadata_fetches'];
  await writeFile(path.join(evidence, 'comparison.csv'), [
    csv(['operation', ...columns.map(column => 'published_' + column), ...columns.map(column => 'candidate_' + column)]),
    ...compared.map(row => csv([row.operation, ...fields(row.baseline, row.baselineStage), ...fields(row.candidate, row.candidateStage)])),
  ].join('\n') + '\n');
  assert.ok(encoderRoutes.every(route => newlyReady.includes(route.operation)), 'Both encoder reads must become ready');
  assert.deepEqual(newlyRefused, []);
}
