/**
 * Structured error types for WSDL compilation
 *
 * Provides context-rich error messages with element names, namespaces,
 * and actionable suggestions for common issues.
 */

/**
 * Context information attached to WSDL compilation errors
 */
export interface WsdlErrorContext {
  /** Element or type name that triggered the error */
  element?: string;
  /** XML namespace where the error occurred */
  namespace?: string;
  /** File or URI of the source document */
  file?: string;
  /** Referenced-by context (e.g., "element 'bar' in type 'Baz'") */
  referencedBy?: string;
  /** Actionable suggestion for resolving the error */
  suggestion?: string;
}

/**
 * Structured error for WSDL/XSD compilation failures.
 *
 * Extends Error with context fields for element, namespace, file, and suggestion.
 * The CLI error handler formats these into multi-line user-friendly messages.
 */
export class WsdlCompilationError extends Error {
  override readonly name = "WsdlCompilationError";

  constructor(
    message: string,
    public readonly context: WsdlErrorContext = {}
  ) {
    super(message);
  }

  /**
   * Formats the error into a user-friendly multi-line message.
   */
  toUserMessage(): string {
    const parts = [this.message];
    if (this.context.element) parts.push(`  Element: ${this.context.element}`);
    if (this.context.namespace) parts.push(`  Namespace: ${this.context.namespace}`);
    if (this.context.referencedBy) parts.push(`  Referenced by: ${this.context.referencedBy}`);
    if (this.context.file) parts.push(`  File: ${this.context.file}`);
    if (this.context.suggestion) parts.push(`  Suggestion: ${this.context.suggestion}`);
    return parts.join("\n");
  }
}
