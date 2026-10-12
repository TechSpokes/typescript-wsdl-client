/** Complete supplied facet annotation infoset, without source provenance. */
import type {SemanticBudget} from './semanticBudget.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxNode} from '../loader/orderedSyntax.js';

export type FacetAnnotationNode = Readonly<
  {kind: 'text'; value: string} |
  {kind: 'element'; name: Readonly<{namespace: string; local: string}>;
    attributes: readonly Readonly<{name: Readonly<{namespace: string; local: string}>; value: string}>[];
    namespaces: Readonly<Record<string, string>>; children: readonly FacetAnnotationNode[]}
>;
export type FacetAnnotation = 'absent' | Readonly<{kind: 'present'; content: FacetAnnotationNode}>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const name = (value: unknown, budget: SemanticBudget): boolean => {
  if (!record(value) || typeof value.namespace !== 'string' || typeof value.local !== 'string') return false;
  budget.chargeWork(value.namespace.length + value.local.length + 2); return true;
};
export function validateFacetAnnotation(value: unknown, budget: SemanticBudget): value is FacetAnnotation {
  if (value === 'absent') return true;
  if (!record(value) || value.kind !== 'present' || !record(value.content)) return false;
  if (value.content.kind !== 'element' || !record(value.content.name)
    || value.content.name.namespace !== XSD_NAMESPACE || value.content.name.local !== 'annotation') return false;
  const stack: unknown[] = [value.content];
  while (stack.length) {
    const node = stack.pop()!; budget.chargeWork(8);
    if (!record(node)) return false;
    if (node.kind === 'text') {
      if (typeof node.value !== 'string') return false;
      budget.chargeWork(node.value.length); continue;
    }
    if (node.kind !== 'element' || !name(node.name, budget) || !Array.isArray(node.attributes)
      || !record(node.namespaces) || !Array.isArray(node.children)) return false;
    budget.chargeWork(node.attributes.length * 4 + node.children.length * 2);
    for (const attribute of node.attributes) {
      if (!record(attribute) || !name(attribute.name, budget) || typeof attribute.value !== 'string') return false;
      budget.chargeWork(attribute.value.length);
    }
    for (let i = 0; i < node.attributes.length; i++) for (let j = i + 1; j < node.attributes.length; j++) {
      budget.chargeWork(2);
      if (budget.compareText(node.attributes[i].name.namespace,node.attributes[j].name.namespace) === 0
        && budget.compareText(node.attributes[i].name.local,node.attributes[j].name.local) === 0) return false;
    }
    for (const prefix in node.namespaces) {
      const uri = node.namespaces[prefix]; if (typeof uri !== 'string') return false;
      budget.chargeWork(prefix.length + uri.length + 1);
    }
    for (const child of node.children) {budget.chargeWork();stack.push(child);}
  }
  return true;
}

/** Preserve XML infoset content, omitting URI, digest, positions and element-name spelling. */
export function projectFacetAnnotation(node: SyntaxElement, budget: SemanticBudget): FacetAnnotation {
  const projectOne = (syntax: SyntaxNode): FacetAnnotationNode => {
    budget.chargeWork(8);
    if (syntax.kind === 'text') {budget.chargeWork(syntax.value.length); return {kind: 'text', value: syntax.value};}
    budget.chargeWork(syntax.name.namespace.length + syntax.name.local.length + syntax.attributes.length * 4 + syntax.children.length * 2);
    const attributes = syntax.attributes.map(attribute => {
      budget.chargeWork(attribute.name.namespace.length + attribute.name.local.length + attribute.value.length);
      return {name: {namespace: attribute.name.namespace, local: attribute.name.local}, value: attribute.value};
    });
    const namespaces: Record<string, string> = Object.create(null);
    for (const prefix in syntax.namespaces) {
      const uri = syntax.namespaces[prefix]; budget.chargeWork(prefix.length + uri.length + 1); namespaces[prefix] = uri;
    }
    budget.chargeWork(2);
    return {kind: 'element', name: {namespace: syntax.name.namespace, local: syntax.name.local},
      attributes, namespaces, children: []};
  };
  const content=projectOne(node);
  const stack:[SyntaxElement,Extract<FacetAnnotationNode,{kind:'element'}>][]=[[node,content as Extract<FacetAnnotationNode,{kind:'element'}>]];
  while(stack.length){
    budget.chargeWork(2);
    const [source,target]=stack.pop()!;
    for(const child of source.children){
      const copied=projectOne(child);budget.chargeWork(2);
      (target.children as FacetAnnotationNode[]).push(copied);
      if(child.kind==='element'){
        budget.chargeWork();stack.push([child,copied as Extract<FacetAnnotationNode,{kind:'element'}>]);
      }
    }
  }
  return {kind: 'present', content};
}

/** A structural mismatch that may share an abstract annotation is unresolved. */
export function compareFacetAnnotation(left: FacetAnnotation, right: FacetAnnotation,
  budget: SemanticBudget): 'equal' | 'different' | 'unresolved' {
  if (left === 'absent' || right === 'absent') return left === right ? 'equal' : 'different';
  const stack: [FacetAnnotationNode, FacetAnnotationNode, boolean][] = [[left.content, right.content, false]];
  let unresolved=false;
  while (stack.length) {
    const [a, b, ambiguousSibling] = stack.pop()!; budget.chargeWork(8);
    if (a.kind !== b.kind) {unresolved=true;continue;}
    if (a.kind === 'text' && b.kind === 'text') {
      budget.chargeWork(a.value.length + b.value.length);
      if (a.value !== b.value) {if(ambiguousSibling)unresolved=true;else return 'different';}
      continue;
    }
    if (a.kind !== 'element' || b.kind !== 'element') return 'unresolved';
    budget.chargeWork(a.name.namespace.length + a.name.local.length + b.name.namespace.length + b.name.local.length);
    if (a.name.namespace !== b.name.namespace || a.name.local !== b.name.local){unresolved=true;continue;}
    const wrapper=a.name.namespace===XSD_NAMESPACE&&a.name.local==='annotation';
    if(a.attributes.length!==b.attributes.length){if(wrapper||ambiguousSibling)unresolved=true;else return 'different';}
    for (const x of a.attributes) {
      let found = false;
      for (const y of b.attributes) {
        budget.chargeWork(x.name.namespace.length + x.name.local.length + x.value.length
          + y.name.namespace.length + y.name.local.length + y.value.length + 4);
        if (x.name.namespace === y.name.namespace && x.name.local === y.name.local && x.value === y.value) {found = true;break;}
      }
      if (!found){if(wrapper||ambiguousSibling)unresolved=true;else return 'different';}
    }
    let xCount=0,yCount=0;
    for (const prefix in a.namespaces) {
      xCount++; budget.chargeWork(prefix.length + a.namespaces[prefix].length + 2);
      if (!Object.hasOwn(b.namespaces,prefix) || a.namespaces[prefix] !== b.namespaces[prefix]) unresolved=true;
    }
    for (const prefix in b.namespaces) {yCount++;budget.chargeWork(prefix.length + 1);}
    if (xCount !== yCount) unresolved=true;
    if(a.children.length!==b.children.length){if(wrapper||ambiguousSibling)unresolved=true;else return 'different';}
    budget.chargeWork(a.children.length * 2);
    const repeated=(children:readonly FacetAnnotationNode[],index:number):boolean=>{
      const selected=children[index];
      for(let j=0;j<children.length;j++){
        budget.chargeWork(3);
        if(j===index)continue;
        const other=children[j];if(selected.kind!==other.kind)continue;
        if(selected.kind==='text')return true;
        if(other.kind==='element'){
          budget.chargeWork(selected.name.namespace.length+selected.name.local.length
            +other.name.namespace.length+other.name.local.length);
          if(selected.name.namespace===other.name.namespace&&selected.name.local===other.name.local)return true;
        }
      }
      return false;
    };
    for (let i = 0; i < Math.min(a.children.length,b.children.length); i++){
      const ambiguous=ambiguousSibling||repeated(a.children,i)||repeated(b.children,i);
      budget.chargeWork();stack.push([a.children[i], b.children[i],ambiguous]);
    }
  }
  return unresolved?'unresolved':'equal';
}
