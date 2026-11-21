import fs from 'node:fs';
import {parseCheckedComponentChoices} from '../checkedPipeline.js';
import {writeCheckedPlanningFile} from '../checkedPlanning.js';
import {readBoundedDescriptor} from '../util/readBoundedFile.js';

export type CheckedDiagnosticKind = 'report' | 'draft';
const maxDiagnosticBytes = 8 * 1024 * 1024;

function assertDiagnosticKind(fd: number, kind: CheckedDiagnosticKind): void {
  try {
    const value: unknown = JSON.parse(readBoundedDescriptor(fd, maxDiagnosticBytes).toString('utf8'));
    if (kind === 'draft') {
      const choices = parseCheckedComponentChoices(value);
      if (choices.namespaceLocations?.some(entry => entry.location === 'REQUIRED_SCHEMA_LOCATION')) return;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const report = value as Record<string, unknown>;
      if (report.version === 'checked-component-plan-v1' && report.model === 'checked-components-v1'
        && report.scope === 'native-component-source-and-mapping' && report.executed === false
        && typeof report.ready === 'boolean' && Array.isArray(report.resources)
        && Array.isArray(report.operations) && Array.isArray(report.blockers)) return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code) throw error;
  }
  throw new Error(`--checked-${kind} can only replace an existing matching diagnostic. Choose a separate destination`);
}

/** Check an existing forced report destination before generation emits project files. */
export function assertStandaloneReportDestination(file: string): void {
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  try {
    assertDiagnosticKind(fd, 'report');
  } finally {
    fs.closeSync(fd);
  }
}

/** Create a diagnostic exclusively, or verify ownership on the descriptor used for forced replacement. */
export function writeStandaloneCheckedDiagnostic(file: string, value: unknown, force: boolean | undefined,
  kind: CheckedDiagnosticKind): void {
  try {
    writeCheckedPlanningFile(file, value);
    return;
  } catch (error) {
    if (!force || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
  try {
    assertDiagnosticKind(fd, kind);
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    fs.writeFileSync(fd, bytes);
    fs.ftruncateSync(fd, bytes.length);
  } finally {
    fs.closeSync(fd);
  }
}
