/**
 * Presents checked planning refusals without changing their structured report.
 * @since Unreleased
 */
import type {CheckedComponentPlan} from '../checkedPlanning.js';

/**
 * Formats each refusal with its construct, reason and next action.
 * @param report Diagnostic data from the unchanged native planning path.
 * @returns Human-readable diagnostics without a stack trace or dumped report object.
 */
export function formatCheckedCliRefusal(report: CheckedComponentPlan): string {
  return report.blockers.map(blocker => {
    const location = blocker.source
      ? `${blocker.source.path} at ${blocker.source.resource}:${blocker.source.line}:${blocker.source.column}`
      : blocker.pointer;
    const ambiguous = blocker.stage === 'selection' && blocker.category === 'ambiguous-selection';
    const operations = [...new Set(blocker.affected.map(selector => selector.operation))];
    const reason = blocker.reason === 'multiple-service-port-binding-candidates'
      ? 'The WSDL has multiple service, port or binding choices.' : blocker.reason;
    const choices = [...new Set(report.candidates.map(candidate =>
      `{${candidate.service.namespace}}${candidate.service.local} / ${candidate.port}`))].join(', ');
    const action = ambiguous
      ? `Set service, port and selectors in a JSON file passed with --checked-config. Available choices: ${choices || 'see the planning report'}. Use --checked-report for operation candidates. Legacy mode (--model legacy) has a separate support profile.`
      : `${blocker.action} See ${blocker.pointer}; use --checked-report to save the structured diagnostics.`;
    return [`Checked generation refused: ${blocker.category}.`, `Construct: ${location}${operations.length ? '; operations: ' + operations.join(', ') : ''}`,
      `Reason: ${reason}`, `Next: ${action}`].join('\n');
  }).join('\n\n');
}
