/**
 * Resolves release dependency pins against the configured npm registry.
 * @since Unreleased
 */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {npmEnv, npmInvocation, ROOT, selectExpectedRange} from './deps.mjs';

const npmView = promisify(execFile);
const lookupLimit = 4;
const maintainedSpecs = new Map([['typescript', 'typescript@6']]);
const packageName = /^(?:@[a-z0-9][a-z0-9_.-]*\/)?[a-z0-9][a-z0-9_.-]*$/i;
const version = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}(?:-([a-z0-9-]+(?:\.[a-z0-9-]+)*))?(?:\+[a-z0-9-]+(?:\.[a-z0-9-]+)*)?$/i;

/**
 * Looks up independent pins with a fixed process limit and input-ordered diagnostics.
 * @param names Direct npm package names in the desired report order.
 * @param currentRanges Existing manifest pins that may be ahead of the registry response.
 * @param lookup Executes one npm view command and returns its JSON output.
 * @returns Expected ranges in input order.
 * @throws Error When any lookup fails or npm returns an invalid version.
 * @why #504 keeps the live npm and certificate configuration for each lookup.
 */
export async function expectedRanges(
  names: readonly string[],
  currentRanges: ReadonlyMap<string, string>,
  lookup = lookupNpmVersion,
): Promise<Map<string, string>> {
  const ranges = new Map<string, string>();
  for (let offset = 0; offset < names.length; offset += lookupLimit) {
    const batch = names.slice(offset, offset + lookupLimit);
    const results = await Promise.allSettled(batch.map(async name => {
      if (!packageName.test(name)) throw new Error('Invalid npm package name');
      const response: unknown = JSON.parse(await lookup(maintainedSpecs.get(name) ?? name));
      const latest: unknown = Array.isArray(response) ? response.at(-1) : response;
      if (typeof latest !== 'string') throw new Error('npm returned an invalid version');
      const parsed = version.exec(latest);
      if (!parsed || parsed[1]?.split('.').some(identifier => /^0\d+$/.test(identifier))) {
        throw new Error('npm returned an invalid version');
      }
      return selectExpectedRange(currentRanges.get(name), latest);
    }));
    for (const [index, result] of results.entries()) {
      const name = batch[index]!;
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
        throw new Error(`Dependency lookup failed for ${name}: ${reason instanceof Error ? reason.message : String(reason)}`, {cause: reason});
      }
      ranges.set(name, result.value);
    }
  }
  return ranges;
}

async function lookupNpmVersion(spec: string): Promise<string> {
  const {command, args, shell} = npmInvocation(['view', spec, 'version', '--json']);
  const {stdout} = await npmView(command, args, {cwd: ROOT, env: npmEnv(), shell, encoding: 'utf8'});
  return stdout;
}
