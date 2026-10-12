/** Internal semantic type identities. Call within the shared request guard. */
import type {AttributeNode, ComplexTypeNode, ElementNode, NodeId, SimpleTypeNode} from './canonicalGraph.js';
import {isBuiltinType} from './canonicalGraph.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {assertSemanticContext,SemanticContextAccessError} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {OriginalGeneratedScalarReference, SemanticTypeIdentity, SemanticTypeReference} from './semanticTypeReference.js';

export type SemanticTypeResolution =
  | Readonly<{kind: 'component'; node: SimpleTypeNode | ComplexTypeNode; identity: Readonly<{kind: 'component'; id: NodeId}>}>
  | Readonly<{kind: 'builtin'; name: ExpandedName; identity: Readonly<{kind: 'builtin'; name: ExpandedName}>}>
  | Readonly<{kind: 'original-generated'; slot: OriginalGeneratedScalarReference; identity: OriginalGeneratedScalarReference}>
  | Readonly<{kind: 'missing'; reference: SemanticTypeReference}>
  | Readonly<{kind: 'outside-context'; reference: SemanticTypeReference}>
  | Readonly<{kind: 'wrong-role'; reference: SemanticTypeReference; component: NodeId}>;

export function resolveSemanticType(context: SemanticContext, reference: SemanticTypeReference): SemanticTypeResolution {
  assertSemanticContext(context);
  const budget = context.budget;
  const kind=ownField(context,reference,'kind'); budget.chargeWork(8);
  if (kind === 'original-generated') {
    const found = context.lookupScalarSlot(reference as OriginalGeneratedScalarReference);
    return found.kind === 'found' ? Object.freeze({kind: 'original-generated', slot: found.slot, identity: found.slot})
      : Object.freeze({kind: found.kind, reference: budget.freeze(budget.snapshot(reference))});
  }
  let found:ReturnType<SemanticContext['resolve']>;
  try{found=context.resolve(reference as Exclude<SemanticTypeReference,OriginalGeneratedScalarReference>);}
  catch(error){if(error instanceof SemanticContextAccessError&&error.code==='reference'){budget.chargeWork(4);throw new TypeError('Malformed semantic type reference');}throw error;}
  if (found.kind === 'builtin') {
    if (found.name.namespace !== XSD_NAMESPACE || !isBuiltinType(found.name.local)) throw new TypeError('Unknown builtin type');
    return Object.freeze({kind: 'builtin', name: found.name, identity: Object.freeze({kind: 'builtin', name: found.name})});
  }
  if (found.kind !== 'found') return Object.freeze({kind: found.kind, reference: budget.freeze(budget.snapshot(reference))});
  if (context.originalSourceComponentAbsent(found.node.id) || found.node.kind !== 'simpleType' && found.node.kind !== 'complexType')
    return Object.freeze({kind: 'wrong-role', reference: budget.freeze(budget.snapshot(reference)), component: found.node.id});
  return Object.freeze({kind: 'component', node: found.node, identity: Object.freeze({kind: 'component', id: found.node.id})});
}

export function declaredType(context: SemanticContext, node: ElementNode | AttributeNode): SemanticTypeReference {
  assertSemanticContext(context); context.budget.chargeWork(48);
  const field = node && typeof node === 'object' ? Object.getOwnPropertyDescriptor(node, 'id') : undefined;
  if (!field || !('value' in field) || typeof field.value !== 'string') throw new TypeError('Unauthenticated declaration');
  const found = context.lookup(field.value);
  if (found.kind !== 'found' || found.node !== node || node.kind !== 'element' && node.kind !== 'attribute')
    throw new TypeError('Unauthenticated declaration');
  return node.kind === 'element' ? context.rawElementProperties(node.id)?.type ?? node.type
    : context.rawAttributeProperties(node.id)?.type ?? node.type;
}

/** Own primitive data only: a key cannot establish membership or validity. */
function ownField(context:SemanticContext,value:unknown,name:string):unknown {
  context.budget.chargeWork(56+name.length);
  if(!value||typeof value!=='object')throw new TypeError('Expected own semantic identity data');
  const field=Object.getOwnPropertyDescriptor(value,name);
  if(!field||!('value' in field))throw new TypeError('Semantic identity fields must be own data');
  return field.value;
}
function stringField(context:SemanticContext,value:unknown,name:string):string {
  const field=ownField(context,value,name);
  if(typeof field!=='string')throw new TypeError('Semantic identity field must be a string');
  return field;
}
/** Collision-free key only; supplied identity data is not lookup authority. */
export function semanticTypeKey(context:SemanticContext,identity:SemanticTypeIdentity):string {
  assertSemanticContext(context);const budget=context.budget,kind=stringField(context,identity,'kind');
  if(kind==='component'||kind==='original-generated') {
    const id=stringField(context,identity,kind==='component'?'id':'owner');
    budget.chargeWork(id.length*2+20);return (kind==='component'?'component:':'generated:')+id.length+':'+id;
  }
  if(kind!=='builtin')throw new TypeError('Malformed semantic type identity');
  const name=ownField(context,identity,'name'),namespace=stringField(context,name,'namespace'),local=stringField(context,name,'local');
  budget.chargeWork((namespace.length+local.length)*2+20);
  return 'builtin:'+namespace.length+':'+namespace+':'+local.length+':'+local;
}
