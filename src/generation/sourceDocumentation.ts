/** Lowers XML source documentation into plain annotation text.
 * @since 1.9.0
 * @constraints Documentation carries no source or runtime authority.
 */
import type {ExpandedName, SyntaxDocument, SyntaxElement, SyntaxNode} from '../loader/orderedSyntax.js';
import {syntaxAttribute, syntaxElements, WSDL_NAMESPACE} from '../loader/orderedSyntax.js';

/** Read text from direct documentation children without publishing source markup.
 * @param owners Source nodes owning documentation elements.
 * @param namespace WSDL or XSD documentation namespace.
 * @param charge Semantic work and cancellation checkpoint.
 * @returns Folded documentation text, or undefined for a blank annotation.
 */
export function sourceDocumentation(owners: readonly SyntaxElement[], namespace: string, charge: (amount: number) => void): string | undefined {
  const documents = owners.flatMap(owner => {
    charge(1 + owner.children.length);
    return syntaxElements(owner, namespace, 'documentation');
  });
  const text = documents.map(document => {
    const remaining: SyntaxNode[] = [document];
    const parts: string[] = [];
    while (remaining.length) {
      const item = remaining.pop()!;
      if (item.kind === 'text') {
        charge(1 + item.value.length);
        parts.push(item.value);
      } else {
        charge(1 + item.children.length);
        for (let index = item.children.length - 1; index >= 0; index--) remaining.push(item.children[index]!);
      }
    }
    return parts.join('');
  });
  return text.join(' ').replace(/\s+/g, ' ').trim() || undefined;
}

/** Render one normalized annotation as a generated TypeScript doc comment.
 * @param text Normalized source documentation.
 * @returns A single inert comment, including the delimiters.
 */
export function documentationComment(text: string): string {
  return '/** ' + text.replaceAll('*/', '* /') + ' */';
}

type DocumentedWsdlNode = Readonly<{name: ExpandedName; description?: string;
  children?: readonly Readonly<{name: string; description: string}>[]}>;
export type CheckedWsdlDocumentation = Partial<Readonly<Record<'bindings' | 'messages' | 'services', readonly DocumentedWsdlNode[]>>>;

/** Collect documentation attached to named WSDL nodes in the checked source closure.
 * @param documents Native source documents from the qualified operation.
 * @param charge Semantic work and cancellation checkpoint.
 * @returns Deterministic documentation metadata for the generated inventory.
 */
export function wsdlSourceDocumentation(documents: readonly SyntaxDocument[], charge: (amount: number) => void): CheckedWsdlDocumentation {
  const result: Partial<Record<keyof CheckedWsdlDocumentation, DocumentedWsdlNode[]>> = {};
  for (const document of documents) {
    const {root} = document;
    charge(1 + root.children.length);
    if (root.name.namespace !== WSDL_NAMESPACE || root.name.local !== 'definitions') continue;
    const namespace = syntaxAttribute(root, 'targetNamespace') ?? '';
    for (const [key, role, childRole] of [['bindings', 'binding', undefined], ['messages', 'message', 'part'], ['services', 'service', 'port']] as const) {
      for (const node of syntaxElements(root, WSDL_NAMESPACE, role)) {
        charge(1 + node.attributes.length);
        const local = syntaxAttribute(node, 'name');
        if (!local) continue;
        const description = sourceDocumentation([node], WSDL_NAMESPACE, charge);
        const children = childRole ? syntaxElements(node, WSDL_NAMESPACE, childRole).flatMap(child => {
          charge(1 + child.attributes.length);
          const name = syntaxAttribute(child, 'name'), description = sourceDocumentation([child], WSDL_NAMESPACE, charge);
          return name && description ? [{name, description}] : [];
        }) : [];
        if (description || children.length) (result[key] ??= []).push({name: {namespace, local},
          ...(description ? {description} : {}), ...(children.length ? {children} : {})});
      }
    }
  }
  for (const items of Object.values(result)) items.sort((a, b) => {
    charge(16 + a.name.namespace.length + b.name.namespace.length + a.name.local.length + b.name.local.length);
    return a.name.namespace < b.name.namespace ? -1 : a.name.namespace > b.name.namespace ? 1
      : a.name.local < b.name.local ? -1 : a.name.local > b.name.local ? 1 : 0;
  });
  return result;
}
