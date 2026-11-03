import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {DirectOperationSelector} from '../../src/compiler/directOperation.js';

interface ExplicitSourceConfiguration {
  localSource: string; fileRoots: string[]; sourceResources: {uri: string; file: string; canonicalUri?: string}[];
  sourceOrigins: string[]; sourceUri?: string; namespaceLocations?: {namespace: string; location: string}[];
  recordSources: {selector: DirectOperationSelector; source: string}[]; standardLibraries: string[];
  capsuleFiles?: Record<string, string>;
}

/** Materialize the advanced configuration used by independent explicit-input regressions.
 * @param project Generated project root.
 * @returns Source paths relative to the project, preserving logical HTTP identities.
 * @throws For absent or differently versioned generated records.
 */
export async function readGeneratedSourceConfiguration(project: string): Promise<ExplicitSourceConfiguration> {
  const record = JSON.parse(await readFile(path.join(project, 'client/source-resources.json'), 'utf8')) as {
    version: string; runtime: ExplicitSourceConfiguration;
  };
  if (record.version !== 'checked-source-resources-v2') throw new Error('Expected generated source records v2');
  const supplied = record.runtime;
  const file = (value: string) => path.join('client', value);
  const logical = (value: string) => /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ? value : file(value);
  return {...supplied, localSource: file(supplied.localSource), fileRoots: supplied.fileRoots.map(file),
    ...(supplied.capsuleFiles ? {capsuleFiles: Object.fromEntries(Object.entries(supplied.capsuleFiles).map(([name, location]) => [name, file(location)]))} : {}),
    sourceResources: supplied.sourceResources.map(resource => ({uri: logical(resource.uri), file: file(resource.file),
      ...(resource.canonicalUri === undefined ? {} : {canonicalUri: logical(resource.canonicalUri)})})),
    ...(supplied.namespaceLocations ? {namespaceLocations: supplied.namespaceLocations.map(location => ({...location, location: logical(location.location)}))} : {}),
    recordSources: (supplied.recordSources ?? []).map(record => ({...record, source: file(record.source)})),
    standardLibraries: supplied.standardLibraries ?? [],
  };
}
