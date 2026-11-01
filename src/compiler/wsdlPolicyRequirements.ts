/** Source-owned WS-Policy requirements; recognition never grants transport or message-security admission. */
import {assertLoadedSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput} from '../loader/schemaInput.js';
import {syntaxAttribute, syntaxElements, isXmlNCName, WSDL_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import {normalizeWhitespace} from './datatypeValues.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';

export const POLICY_12 = 'http://schemas.xmlsoap.org/ws/2004/09/policy';
export const SECURITY_POLICY_11 = 'http://schemas.xmlsoap.org/ws/2005/07/securitypolicy';
const WSU = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const suites = ['Basic256', 'Basic192', 'Basic128', 'TripleDes', 'Basic256Rsa15', 'Basic192Rsa15', 'Basic128Rsa15',
  'TripleDesRsa15', 'Basic256Sha256', 'Basic192Sha256', 'Basic128Sha256', 'TripleDesSha256',
  'Basic256Sha256Rsa15', 'Basic192Sha256Rsa15', 'Basic128Sha256Rsa15', 'TripleDesSha256Rsa15'] as const;
const layouts = ['Strict', 'Lax', 'LaxTsFirst', 'LaxTsLast'] as const;
export type TransportPolicyRequirements = Readonly<{
  kind: 'https-transport'; requireClientCertificate: boolean;
  algorithmSuite: typeof suites[number]; layout: typeof layouts[number]; includeTimestamp: boolean;
  source: SyntaxSource; enforced: false;
}>;
export type BindingPolicyRequirements = Readonly<{kind: 'none'}> | TransportPolicyRequirements;
export interface WsdlPolicyRequirements {
  readonly kind: 'wsdl-policy-requirements'; readonly admitted: false;
  isPolicyMetadata(node: SyntaxElement): boolean;
  forBinding(binding: SyntaxElement): BindingPolicyRequirements;
}
export type PolicyRequirementsFailure = Readonly<{kind: 'unsupported' | 'invalid-schema'; rule: string; source: SyntaxSource}>;
const issued = new WeakMap<WsdlPolicyRequirements, SchemaInput>();
class Stop extends Error {constructor(readonly result: PolicyRequirementsFailure) {super(result.rule);}}

/** Authenticate the exact loaded snapshot; copied reports or source-shaped records confer no policy authority. */
export function assertWsdlPolicyRequirements(input: SchemaInput, value: WsdlPolicyRequirements): void {
  assertLoadedSchemaInput(input);
  if (issued.get(value) !== input) throw new TypeError('Fresh source-bound WSDL policy requirements required');
}

/** Interpret a closed single-alternative HTTPS transport-policy fragment and same-document binding references.
 * @remarks Unknown assertions, external/nested references, multiple alternatives/attachments and digest references
 *   remain explicit refusals. No policy fetch, endpoint permission, algorithm execution or security-header emission occurs.
 *   The July 2005 defaults are Lax layout and no timestamp. Client-certificate omission is outside this qualified fragment.
 * @returns Source-owned requirements or an explicit unsupported/invalid/resource result; enforcement remains false.
 * @throws TypeError For unauthenticated source or foreign binding inspection. Caller cancellation propagates unchanged.
 * @see https://www.w3.org/submissions/WS-Policy/
 * @see https://specs.xmlsoap.org/ws/2005/07/securitypolicy/ws-securitypolicy.pdf
 */
export function prepareWsdlPolicyRequirements(input: SchemaInput, budget: SemanticBudget, check: () => void):
  WsdlPolicyRequirements | PolicyRequirementsFailure | ResourceLimitFailure {
  assertLoadedSchemaInput(input);
  return budget.guard(() => {
    const fail = (node: SyntaxElement, rule: string, kind: PolicyRequirementsFailure['kind'] = 'unsupported'): never => {
      budget.chargeWork(64 + rule.length); throw new Stop(Object.freeze({kind, rule, source: node.source}));
    };
    const elements = (node: SyntaxElement): SyntaxElement[] => {
      check(); budget.chargeWork(32 + node.children.length * 8 + node.attributes.length * 16);
      for (const child of node.children) if (child.kind === 'text' && /[^\t\r\n ]/.test(child.value)) fail(node, 'policy-text', 'invalid-schema');
      return syntaxElements(node);
    };
    const attrs = (node: SyntaxElement, allowed: readonly string[] = [], id = false): void => {
      for (const attribute of node.attributes) {
        check(); budget.chargeWork(32 + attribute.value.length * 4);
        if (attribute.name.namespace === '' && allowed.includes(attribute.name.local)) continue;
        if (id && attribute.name.namespace === WSU && attribute.name.local === 'Id') continue;
        fail(node, 'policy-attribute');
      }
    };
    const is = (node: SyntaxElement, namespace: string, local: string) => node.name.namespace === namespace && node.name.local === local;
    // Framework flattening is iterative and refuses choice instead of guessing an alternative.
    const assertions = (policy: SyntaxElement): SyntaxElement[] => {
      const pending = [policy], result: SyntaxElement[] = [];
      while (pending.length) {
        check(); const node = pending.pop()!;
        if (node.name.namespace === POLICY_12 && ['Policy', 'All', 'ExactlyOne'].includes(node.name.local)) {
          attrs(node, [], node === policy && node.name.local === 'Policy');
          const children = elements(node);
          if (node.name.local === 'ExactlyOne' && children.length !== 1) fail(node, 'policy-alternatives');
          for (let i = children.length - 1; i >= 0; i--) {check(); pending.push(children[i]!);}
        } else {
          if (node.name.namespace === POLICY_12) fail(node, 'nested-policy-reference-or-operator');
          result.push(node);
        }
      }
      return result;
    };
    const nested = (node: SyntaxElement): SyntaxElement[] => {
      attrs(node);
      const children = elements(node);
      if (children.length !== 1 || !is(children[0]!, POLICY_12, 'Policy')) return fail(node, 'nested-policy-required');
      return assertions(children[0]!);
    };
    const leaf = (node: SyntaxElement): void => {attrs(node); if (elements(node).length) fail(node, 'policy-leaf-content');};
    const transport = (node: SyntaxElement): TransportPolicyRequirements => {
      const parts = nested(node), byName = new Map<string, SyntaxElement>();
      for (const part of parts) {
        check();
        if (part.name.namespace !== SECURITY_POLICY_11 || !['TransportToken', 'AlgorithmSuite', 'Layout', 'IncludeTimestamp'].includes(part.name.local))
          fail(part, 'transport-policy-assertion');
        if (byName.has(part.name.local)) fail(part, 'duplicate-transport-property', 'invalid-schema');
        byName.set(part.name.local, part);
      }
      const token = byName.get('TransportToken'), suite = byName.get('AlgorithmSuite');
      if (!token || !suite) return fail(node, 'transport-token-and-algorithm-suite-required', 'invalid-schema');
      const tokens = nested(token);
      if (tokens.length !== 1 || !is(tokens[0]!, SECURITY_POLICY_11, 'HttpsToken')) return fail(token, 'transport-token-kind');
      const https = tokens[0]!;
      attrs(https, ['RequireClientCertificate']);
      if (elements(https).length) fail(https, 'https-token-additional-policy');
      const certificate = syntaxAttribute(https, 'RequireClientCertificate');
      if (certificate === undefined) return fail(https, 'https-token-client-certificate-default-unqualified');
      const lexical = normalizeWhitespace(certificate, 'collapse');
      if (!['true', '1', 'false', '0'].includes(lexical)) fail(https, 'https-token-client-certificate-boolean', 'invalid-schema');
      const algorithms = nested(suite);
      if (algorithms.length !== 1 || algorithms[0]!.name.namespace !== SECURITY_POLICY_11 || !suites.some(name => name === algorithms[0]!.name.local))
        return fail(suite, 'algorithm-suite');
      leaf(algorithms[0]!);
      let layout: typeof layouts[number] = 'Lax';
      const layoutNode = byName.get('Layout');
      if (layoutNode) {
        const selected = nested(layoutNode);
        if (selected.length !== 1 || selected[0]!.name.namespace !== SECURITY_POLICY_11 || !layouts.some(name => name === selected[0]!.name.local))
          return fail(layoutNode, 'security-header-layout');
        leaf(selected[0]!); layout = selected[0]!.name.local as typeof layout;
      }
      const timestamp = byName.get('IncludeTimestamp'); if (timestamp) leaf(timestamp);
      budget.chargeWork(128);
      return Object.freeze({kind: 'https-transport', requireClientCertificate: lexical === 'true' || lexical === '1',
        algorithmSuite: algorithms[0]!.name.local as typeof suites[number], layout, includeTimestamp: timestamp !== undefined,
        source: node.source, enforced: false});
    };
    try {
      const metadata = new Set<SyntaxElement>(), bindings = new Map<SyntaxElement, BindingPolicyRequirements>();
      const none: BindingPolicyRequirements = Object.freeze({kind: 'none'});
      for (const document of input.documents) {
        check(); if (!is(document.root, WSDL_NAMESPACE, 'definitions')) continue;
        const ids = new Map<string, SyntaxElement>(), pending = [document.root];
        while (pending.length) {
          check(); const node = pending.pop()!, lexicalId = syntaxAttribute(node, 'Id', WSU);
          if (lexicalId !== undefined) {
            budget.chargeWork(32 + lexicalId.length * 4);
            const id = normalizeWhitespace(lexicalId, 'collapse');
            if (!isXmlNCName(id) || ids.has(id)) fail(node, 'policy-id-uniqueness', 'invalid-schema');
            ids.set(id, node);
          }
          for (const child of syntaxElements(node)) {check(); pending.push(child);}
        }
        const policies = new Map<SyntaxElement, BindingPolicyRequirements>();
        const parse = (policy: SyntaxElement): BindingPolicyRequirements => {
          const cached = policies.get(policy); if (cached) return cached;
          const leaves = assertions(policy);
          if (leaves.length > 1) return fail(policy, 'policy-assertion-combination');
          if (leaves.length && !is(leaves[0]!, SECURITY_POLICY_11, 'TransportBinding')) return fail(leaves[0]!, 'policy-assertion');
          const result = leaves.length ? transport(leaves[0]!) : none;
          policies.set(policy, result); return result;
        };
        for (const node of syntaxElements(document.root)) if (is(node, POLICY_12, 'Policy')) {parse(node); metadata.add(node);}
        for (const binding of syntaxElements(document.root, WSDL_NAMESPACE, 'binding')) {
          const attachments = syntaxElements(binding).filter(node => node.name.namespace === POLICY_12);
          if (attachments.length > 1) fail(binding, 'multiple-policy-attachments');
          let result: BindingPolicyRequirements = none;
          for (const attachment of attachments) {
            if (is(attachment, POLICY_12, 'Policy')) result = parse(attachment);
            else if (is(attachment, POLICY_12, 'PolicyReference')) {
              attrs(attachment, ['URI']); if (elements(attachment).length) fail(attachment, 'policy-reference-content');
              const uri = syntaxAttribute(attachment, 'URI');
              if (!uri?.startsWith('#')) return fail(attachment, 'external-policy-reference');
              if (new URL(attachment.baseUri).href.split('#')[0] !== new URL(document.uri).href.split('#')[0])
                return fail(attachment, 'external-policy-reference');
              let id: string;
              try {id = decodeURIComponent(uri.slice(1));} catch {return fail(attachment, 'policy-reference-fragment', 'invalid-schema');}
              const target = ids.get(id);
              if (!target || !is(target, POLICY_12, 'Policy')) return fail(attachment, 'policy-reference-target', 'invalid-schema');
              if (!metadata.has(target)) return fail(attachment, 'policy-reference-placement');
              result = parse(target);
            } else return fail(attachment, 'policy-attachment');
            metadata.add(attachment);
          }
          bindings.set(binding, result);
        }
      }
      const owner: WsdlPolicyRequirements = Object.freeze({kind: 'wsdl-policy-requirements', admitted: false,
        isPolicyMetadata(node: SyntaxElement) {return metadata.has(node);},
        forBinding(binding: SyntaxElement) {
          const value = bindings.get(binding);
          if (!value) throw new TypeError('Original source binding required for policy requirements');
          return value;
        }});
      issued.set(owner, input); return owner;
    } catch (error) {if (error instanceof Stop) return error.result; throw error;}
  });
}
