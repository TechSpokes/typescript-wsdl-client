import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {planCheckedComponents} from '../../src/checkedPlanning.js';
import {formatCheckedCliRefusal} from '../../src/util/checkedCliDiagnostics.js';

describe('checked CLI refusals', () => {
  it('explains the Weather ambiguity using real candidates and existing configuration keys', async () => {
    const report = await planCheckedComponents('examples/minimal/weather.wsdl');
    const text = formatCheckedCliRefusal(report);
    expect(text).toContain('Checked generation refused: ambiguous-selection');
    expect(text).toContain('multiple service, port or binding choices');
    expect(text).toContain('--checked-config');
    expect(text).toContain('service, port and selectors');
    expect(text).toContain('Weather / WeatherSoap');
    expect(text).toContain('Legacy mode (--model legacy) has a separate support profile');
  });

  it('retains a real source location and next action without modifying the report', async () => {
    const report = await planCheckedComponents('test/conformance/fixtures/assessment/wsdl-first-missing.wsdl');
    const before = JSON.stringify(report);
    const blocker = report.blockers.find(blocker => blocker.source)!;
    expect(blocker).toBeDefined();
    const text = formatCheckedCliRefusal(report);
    expect(text).toContain(`${blocker.source!.resource}:${blocker.source!.line}:${blocker.source!.column}`);
    expect(text).toContain(blocker.source!.path);
    expect(text).toContain(blocker.action);
    expect(JSON.stringify(report)).toBe(before);
  });

  it('preserves the record-path remedy for mapping ambiguity instead of suggesting service selection', async () => {
    const report = await planCheckedComponents('examples/minimal/weather.wsdl');
    const action = 'Supply recordPath using expanded names to select one declared repeated complex record.';
    const text = formatCheckedCliRefusal({...report, blockers: [{...report.blockers[0]!,
      stage: 'native-preparation', dimension: 'mapping-and-artifact', reason: 'ambiguous-record-path: multiple records',
      pointer: 'checkedComponents.recordProjections[].recordPath', action}]});
    expect(text).toContain(action);
    expect(text).toContain('checkedComponents.recordProjections[].recordPath');
    expect(text).not.toContain('Set service, port and selectors');
  });

  it('names an explicitly requested unsupported operation rather than losing its identity', async () => {
    const namespace = 'urn:checked:forecast';
    const report = await planCheckedComponents('test/conformance/fixtures/assessment/forecast.wsdl', {selectors: [{
      portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'UnimplementedRequestedOperation',
    }]});
    expect(report.ready).toBe(false);
    expect(formatCheckedCliRefusal(report)).toContain('UnimplementedRequestedOperation');
  });

  it('keeps structured reports and nonzero exits while requiring DEBUG for the raw error', async () => {
    mkdirSync('tmp/conformance/checked-cli', {recursive: true});
    const directory = mkdtempSync(path.resolve('tmp/conformance/checked-cli/refusal-'));
    try {
      const run = (debug: string, report: string) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'pipeline',
        '--model', 'checked-components-v1', '--wsdl-source', 'examples/minimal/weather.wsdl',
        '--client-dir', path.join(directory, 'generated/client'), '--openapi-file', path.join(directory, 'generated/openapi.json'),
        '--gateway-dir', path.join(directory, 'generated/gateway'), '--gateway-service-name', 'weather',
        '--gateway-version-prefix', 'v1', '--checked-report', path.join(directory, report)],
      {encoding: 'utf8', timeout: 60_000, env: {...process.env, DEBUG: debug}});
      const normal = run('', 'normal.json');
      const debug = run('wsdl-tsc', 'debug.json');
      expect(normal.error).toBeUndefined();
      expect(debug.error).toBeUndefined();
      expect(normal.status).toBe(1);
      expect(debug.status).toBe(1);
      expect(normal.stdout).toBe('');
      expect(normal.stderr).toContain('Checked generation refused: ambiguous-selection');
      expect(normal.stderr).not.toContain('CheckedPlanningError');
      expect(normal.stderr).not.toContain('    at ');
      expect(debug.stderr).toContain('CheckedPlanningError');
      const bytes = readFileSync(path.join(directory, 'normal.json'), 'utf8');
      expect(bytes).toBe(readFileSync(path.join(directory, 'debug.json'), 'utf8'));
      expect(JSON.parse(bytes)).toEqual(await planCheckedComponents('examples/minimal/weather.wsdl'));
      expect(existsSync(path.join(directory, 'generated'))).toBe(false);
    } finally {rmSync(directory, {recursive: true, force: true});}
  }, 150_000);
});
