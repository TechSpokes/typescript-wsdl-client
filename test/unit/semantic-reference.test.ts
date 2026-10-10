import {mkdirSync, mkdtempSync, rmSync, readFileSync} from "node:fs";
import {expect, it} from "vitest";
import {discoverReferenceTests, verifySetup, runReference} from '../../scripts/semantic-reference.js';
import {qualifyPrimary, type BaselineCase} from '../conformance/reference/adapter.js';

it("rejects an unsupported Node runtime and empty reference discovery", () => {
  expect(() => verifySetup('22.0.0')).toThrow('Required Node >=24');
  mkdirSync('tmp/conformance', {recursive: true});
  const directory = mkdtempSync('tmp/conformance/empty-reference-');
  try { expect(() => discoverReferenceTests(directory)).toThrow('Empty reference test discovery'); }
  finally { rmSync(directory, {recursive: true, force: true}); }
});
it("propagates a failed test command instead of reporting baseline success", async () => {
  await expect(runReference({execute: () => {throw new Error('reference command failed');}})).rejects.toThrow('reference command failed');
});
it("reports a changed literal instance observation as a qualification failure", async () => {
  const manifest = JSON.parse(readFileSync('test/conformance/semantic-baseline.json', 'utf8')) as {cases: BaselineCase[]};
  const row = structuredClone(manifest.cases[0]);
  row.instances[0].expected = 'rejected';
  const result = await qualifyPrimary({cases: [row]});
  expect(result.failures).toEqual(['original-sequence: instance disagreement xsd/compositors/instances/original-sequence-1.xml']);
});
