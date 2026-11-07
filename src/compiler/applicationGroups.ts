/** Source-derived application presentation; native particles and scalar owners retain admission duties. */
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import type {SemanticContext} from './semanticContext.js';
import type {SemanticParticle} from './particleSemanticView.js';
import type {DirectProjectionPlan, DirectProjectionRecord, DirectProjectionSlot, DirectProjectionValue} from './directStructurePlan.js';
import {inspectProjectionGrammar} from './directStructurePlan.js';
import {deepFreeze} from './canonicalGraph.js';

export interface ApplicationGroupName {readonly target: string; readonly propertyName?: string; readonly typeName?: string}
export interface ApplicationGroupsOptions {readonly names?: readonly ApplicationGroupName[]}
export interface ApplicationGroupTarget {
  readonly target: string; readonly role: 'choice' | 'sequence' | 'alternative'; readonly source: string;
  readonly defaults: {readonly propertyName?: string; readonly typeName: string};
  readonly resolved: {readonly propertyName?: string; readonly typeName: string};
}
export interface ApplicationGroupRecord {
  readonly source: string; readonly disposition: 'grouped' | 'retained-ordered' | 'compact'; readonly reason: string;
}
export type GroupNode = {readonly particle: SemanticParticle; readonly slot?: DirectProjectionSlot;
  readonly children: readonly GroupNode[]; readonly target?: ApplicationGroupTarget; readonly alternatives?: readonly ApplicationGroupTarget[]};
export interface ApplicationGroupPlan {
  readonly records: Readonly<Record<string, GroupNode>>; readonly targets: readonly ApplicationGroupTarget[];
  readonly dispositions: readonly ApplicationGroupRecord[];
}
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Stable private record symbol shared across operation directions and schema scopes. */
export const applicationRecordName = (id: string): string => 'ApplicationRecord_' + createHash('sha256').update(id).digest('hex').slice(0,16);
const reserved = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with as implements interface let package private protected public static yield any bigint boolean constructor declare get module require number set string symbol type from of unknown never object readonly abstract async await namespace undefined NaN Infinity Record Readonly Array Promise Date Error Object String Number Boolean Map Set JSON').split(' '));
const metadata = new Set(['$value', '$content', '$attributes', '$namespace', '$namespaces', '$nil']);

/** Copy strict data-only generation options, rejecting malformed arrays before any source work. */
export function parseApplicationGroups(value: unknown): ApplicationGroupsOptions {
  const record = (input: unknown, allowed: readonly string[]): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || types.isProxy(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input) as object | null)) throw new TypeError('applicationGroups requires data records');
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      const d = Object.getOwnPropertyDescriptor(input, key)!;
      if (typeof key !== 'string' || !allowed.includes(key) || !('value' in d)) throw new TypeError('Unknown applicationGroups field or accessor');
      result[key] = d.value;
    }
    return result;
  };
  const options = record(value, ['names']);
  if (!Object.hasOwn(options, 'names')) return {};
  if (types.isProxy(options.names) || !Array.isArray(options.names) || Object.getPrototypeOf(options.names) !== Array.prototype) throw new TypeError('applicationGroups.names requires a dense array');
  const array = options.names as unknown[], length = Object.getOwnPropertyDescriptor(array, 'length')!.value as number;
  if (Reflect.ownKeys(array).length !== length + 1) throw new TypeError('applicationGroups.names requires a dense array');
  const names: ApplicationGroupName[] = [], seen = new Set<string>();
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(array, String(i));
    if (!d || !('value' in d)) throw new TypeError(`applicationGroups.names[${i}] requires data`);
    const item = record(d.value, ['target', 'propertyName', 'typeName']);
    if (typeof item.target !== 'string' || !item.target || seen.has(item.target)) throw new TypeError(`applicationGroups.names[${i}] requires a unique target`);
    seen.add(item.target);
    if (!Object.hasOwn(item, 'propertyName') && !Object.hasOwn(item, 'typeName')) throw new TypeError(`applicationGroups.names[${i}] requires an override`);
    if (Object.hasOwn(item, 'propertyName') && (typeof item.propertyName !== 'string' || !/^\$[a-z][A-Za-z0-9]*$/.test(item.propertyName) || metadata.has(item.propertyName))) throw new TypeError(`applicationGroups.names[${i}] invalid propertyName`);
    if (Object.hasOwn(item, 'typeName') && (typeof item.typeName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.typeName) || reserved.has(item.typeName))) throw new TypeError(`applicationGroups.names[${i}] invalid typeName`);
    names.push(item as unknown as ApplicationGroupName);
  }
  return {names};
}

/** Derive finite group definitions from exact qualified records; no caller inventory is trusted. */
export function planApplicationGroups(context: SemanticContext, projection: DirectProjectionPlan, options: ApplicationGroupsOptions,
  checkpoint: () => void): ApplicationGroupPlan {
  const check = () => {checkpoint(); context.budget.chargeWork(16);};
  const records = new Map<string, GroupNode>(), targets: ApplicationGroupTarget[] = [], dispositions: ApplicationGroupRecord[] = [];
  const overrides = new Map((options.names ?? []).map(item => [item.target, item]));
  const recordSymbols: string[] = [];
  const sourceTypes = context.members.flatMap(id=>{
    check(); const found=context.lookup(id);
    if (found.kind==='found' && found.node.kind==='complexType') recordSymbols.push(applicationRecordName(found.node.id));
    return found.kind==='found' && (found.node.kind==='complexType' || found.node.kind==='simpleType') && found.node.identity.kind==='global' ? [found.node] : [];
  });
  // @why Injective source spelling keeps separate operation mappings consistent without a mutable service-wide allocator.
  const sourceStem = (name: string): string => [...name].map(c=>/^[A-Za-z0-9]$/.test(c)?c:'_u'+c.codePointAt(0)!.toString(16)+'_').join('');
  const shape = (p: SemanticParticle): unknown => {
    check(); return [p.kind, p.occurs, p.element ? [p.element.name, p.element.type.kind === 'local' ? p.element.type.target : p.element.type.name] : null, p.children.map(shape)];
  };
  const stem = (record: DirectProjectionRecord): string => {
    const id = record.type.identity;
    if (id.kind === 'global') {
      const base=sourceStem(id.name.local);
      return sourceTypes.filter(t=>t.identity.kind==='global' && t.identity.name.local===id.name.local).length>1 ? base+'_'+digest(id.name.namespace).slice(0,8) : base;
    }
    const owner = context.lookup(id.owner);
    const name = owner.kind === 'found' && 'name' in owner.node ? owner.node.name.local : 'Anonymous';
    return sourceStem(name) + '___Anonymous_' + digest([id.owner, id.path]).slice(0, 16);
  };
  for (const record of projection.records) {
    check(); const grammar = inspectProjectionGrammar(context, record), source = record.type.identity.kind === 'global'
      ? `{${record.type.identity.name.namespace}}${record.type.identity.name.local}` : record.type.id;
    if (!grammar) {dispositions.push({source, disposition: 'compact', reason: 'ordinary-record'}); continue;}
    let reason = record.keyed || record.content !== 'element-only' || record.attributeWildcard ? 'mixed-open-or-keyed-owner' : '';
    const nullable = (p: SemanticParticle): boolean => grammar.bodyNullable(p);
    const leaves = (p: SemanticParticle): Set<string> => new Set(p.element ? [p.element.id] : p.children.flatMap(c => [...leaves(c)]));
    const lengths = (p: SemanticParticle): readonly [bigint, bigint | undefined] => {
      check(); const items = p.children.map(lengths);
      const min = p.kind === 'element' ? 1n : p.kind === 'choice' ? items.reduce((a,b) => a < b[0] ? a : b[0], items[0]?.[0] ?? 0n) : items.reduce((a,b) => a+b[0],0n);
      const max = p.kind === 'element' ? 1n : items.some(x => x[1] === undefined) ? undefined : p.kind === 'choice' ? items.reduce((a,b) => a > b[1]! ? a : b[1]!,0n) : items.reduce((a,b) => a+b[1]!,0n);
      return [min*BigInt(p.occurs.min), max === undefined || p.occurs.max === 'unbounded' ? undefined : max*BigInt(p.occurs.max)];
    };
    const last = (n: SemanticParticle): Set<string> => {
      check(); if (n.element) return leaves(n);
      const result = new Set<string>();
      for (const child of [...n.children].reverse()) {for (const key of last(child)) result.add(key); if (n.kind === 'sequence' && !child.summary.nullable) break;}
      return result;
    };
    const hasDelimiter = (p: SemanticParticle, unit = false): boolean => {
      check();
      if (!unit && (p.occurs.min==='0' || p.occurs.min!==p.occurs.max)) return false;
      if (p.kind==='element') return true;
      return p.kind==='choice' ? p.children.every(child=>hasDelimiter(child)) : p.children.some(child=>hasDelimiter(child));
    };
    const partitionable = (p: SemanticParticle, unit = false): boolean => {
      check();
      // @why Globally disjoint leaf sites make a mandatory fixed-count marker recover item boundaries even beside optional fields.
      if (hasDelimiter(p,unit)) return true;
      if (p.kind==='choice' && (unit || p.occurs.min==='1' && p.occurs.max==='1')) return p.children.every(child=>partitionable(child));
      const [min,max]=lengths(unit ? {...p,occurs:{min:'1',max:'1'}} : p);
      if (min===max) return true;
      const first=grammar.first(p),end=last(p);
      return !record.slots.some(s=>end.has(s.element.id) && first.includes(JSON.stringify([s.element.name.namespace,s.element.name.local])));
    };
    const eligible = (p: SemanticParticle): void => {
      check();
      if (p.kind === 'any' || p.kind === 'all') reason ||= 'retained-native-compositor';
      if ((p.kind === 'choice' || p.kind === 'sequence' && (p.occurs.max !== '1' || p.occurs.min !== '1')) && nullable(p)) reason ||= 'empty-capable-group-body';
      if (p.kind !== 'element' && p.occurs.max !== '1') {
        // @why A variable-width body whose end can start another item cannot recover occurrence boundaries.
        if (!partitionable(p,true)) reason ||= 'ambiguous-group-partition';
      }
      for (const child of p.children) eligible(child);
    };
    eligible(grammar.view.root);
    if (reason) {dispositions.push({source, disposition: 'retained-ordered', reason}); continue;}
    const guard = digest(shape(grammar.view.root));
    const target = (p: SemanticParticle, role: ApplicationGroupTarget['role'], typeName: string, propertyName?: string, parent?: string): ApplicationGroupTarget => {
      const token = 'ag1:' + digest([record.type.id, p.source, p.origins, role, parent ?? null, guard, shape(p)]);
      const defaults = {...(propertyName ? {propertyName} : {}), typeName}, alias = overrides.get(token);
      if (role === 'alternative' && alias?.propertyName !== undefined) throw new TypeError(`applicationGroups target ${token} alternative ${source} does not support propertyName`);
      const found=context.lookup(p.source), site=found.kind==='found' && found.node.identity.kind==='scoped' ? found.node.identity.path : p.source;
      const item: ApplicationGroupTarget = {target: token, role, source: `${source} ${role} ${site}`, defaults, resolved: {...defaults}};
      targets.push(item); return item;
    };
    const object = (p: SemanticParticle, contextStem: string, nested = false): GroupNode => {
      const counters = {choice: 0, sequence: 0};
      const visit = (p: SemanticParticle): GroupNode => {
        check();
        if (p.kind === 'element') return {particle: p, children: [], slot: grammar.slot(JSON.stringify([p.element!.name.namespace,p.element!.name.local]))!};
        const role = p.kind === 'choice' ? 'choice' : p.occurs.max !== '1' || p.occurs.min !== '1' ? 'sequence' : undefined;
        if (!role) return {particle:p, children:p.children.map(visit)};
        const index = ++counters[role], suffix = index === 1 ? '' : String(index);
        const title = role === 'choice' ? 'Choice' : 'Sequence';
        const name = contextStem + (nested ? '___' : '') + title + suffix;
        const own = target(p, role, name, '$' + role + suffix);
        if (role === 'choice') {
          const alternatives = p.children.map((child,i) => target(child,'alternative', name + 'Alternative' + (i+1), undefined, own.target));
          return {particle:p,target:own,alternatives,children:p.children.map((child,i) => object(child, alternatives[i]!.defaults.typeName,true))};
        }
        return {particle:p,target:own,children:object({...p,occurs:{min:'1',max:'1'}},name,true).children};
      };
      // @why An alternative's own occurrence belongs to the alternative, not to a second wrapper around it.
      return {particle:p,children:p.kind === 'sequence' && p.occurs.min === '1' && p.occurs.max === '1' ? p.children.map(visit) : [visit(p)]};
    };
    const root = grammar.view.root;
    const wrapper = root.kind === 'choice' || root.occurs.max !== '1' || root.occurs.min !== '1'
      ? object({...root,kind:'sequence',occurs:{min:'1',max:'1'},children:[root]},stem(record)) : object(root,stem(record));
    records.set(record.type.id,wrapper);
    dispositions.push({source,disposition:'grouped',reason:'observable-nonempty-particle-boundaries'});
  }
  // @why Default collisions use identity suffixes; explicit collisions must never silently change requested names.
  const used = new Map<string,string>();
  for (const name of ['Request','Response','Usage','Name','Options','Failure','NativeSuccess','Runtime','Common','Result','ApplicationOpenValue',
    ...Array.from({length:projection.records.length+1},(_,i)=>'Fault_'+i)]) used.set(name,'generated-client');
  for (const type of sourceTypes) if (type.identity.kind==='global') used.set(type.identity.name.local,type.id);
  for (const name of recordSymbols) used.set(name,'source-record');
  for (const item of targets) {
    let name = item.defaults.typeName;
    if (used.has(name) && used.get(name) !== item.target) {
      name += '_' + item.target.slice(4,16);
      (item.defaults as {typeName:string}).typeName = name;
    }
    (item.resolved as {typeName:string}).typeName = name;
    used.set(name,item.target);
  }
  for (const item of targets) {
    const alias = overrides.get(item.target);
    if (alias?.typeName && (/^Fault_[0-9]+$/.test(alias.typeName) || used.has(alias.typeName) && used.get(alias.typeName)!==item.target)) throw new TypeError(`applicationGroups target ${item.target} ${item.source}: typeName collision ${alias.typeName}`);
    if (alias?.typeName) {used.set(alias.typeName,item.target); (item.resolved as {typeName:string}).typeName=alias.typeName;}
    if (alias?.propertyName) (item.resolved as {propertyName:string}).propertyName=alias.propertyName;
  }
  const properties = (node: GroupNode, keys: Set<string>): void => {
    if (node.slot) {keys.add(node.slot.element.name.local); return;}
    if (!node.target) {for (const child of node.children) properties(child,keys); return;}
    const key = node.target.resolved.propertyName!;
    if (keys.has(key)) throw new TypeError(`applicationGroups target ${node.target.target}: propertyName collision ${key}`);
    keys.add(key);
    if (node.alternatives) for (const child of node.children) properties(child,new Set());
    else {const bodyKeys=new Set<string>();for (const child of node.children) properties(child,bodyKeys);}
  };
  for (const node of records.values()) properties(node,new Set());
  return deepFreeze({records:Object.fromEntries(records),targets,dispositions});
}

export class ApplicationGroupValueError extends Error {}
type Data = Record<string, unknown>;
/** Convert owned data between grouped and existing ordered values without adding XML wrappers.
 * @constraints Input must first pass the bounded data-only owner; recursive calls are depth-limited.
 */
export function mapApplicationGroups(plan: ApplicationGroupPlan, projection: DirectProjectionPlan, input: unknown,
  direction: 'to-native' | 'from-native', check: () => void): unknown {
  const records = new Map(projection.records.map(r=>[r.type.id,r]));
  const fail = (reason: string): never => {throw new ApplicationGroupValueError(reason);};
  const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : fail('group-object-required');
  const bounds = (n: number, p: SemanticParticle) => {
    if (BigInt(n) < BigInt(p.occurs.min) || p.occurs.max !== 'unbounded' && BigInt(n) > BigInt(p.occurs.max)) fail('group-occurrence-bound');
  };
  const value = (v: unknown, shape: DirectProjectionValue, depth: number): unknown => {
    check(); if (depth > 200) fail('application-group-depth-limit');
    if (shape.kind !== 'record') return v;
    const record = records.get(shape.type)!, data = object(v), result: Data = {...data};
    if (data.$nil === true) return result;
    const group = plan.records[shape.type];
    const child = (v: unknown, slot: DirectProjectionSlot) => value(v,slot.value,depth+1);
    if (!group) {
      if (record.ordered && Array.isArray(data.$content)) result.$content = data.$content.map((entry,index) => {
        const item = object(entry);
        const slot = record.keyed ? record.fixedOrder ? record.slots[index] : record.slots.find(s=>{
          const v=item[s.element.name.local];
          return Object.hasOwn(item,s.element.name.local) && (!v || typeof v!=='object' || !Object.hasOwn(v,'$namespace')
            || (v as Data).$namespace===s.element.name.namespace);
        }) : record.slots.find(s=>JSON.stringify(s.element.name) === JSON.stringify(item.name));
        if (!slot) return entry;
        return record.keyed ? {[slot.element.name.local]:child(item[slot.element.name.local],slot)} : {...item,value:child(item.value,slot)};
      });
      else for (const slot of record.slots) if (Object.hasOwn(data,slot.element.name.local)) {
        const v = data[slot.element.name.local]; result[slot.element.name.local] = Array.isArray(v) && slot.particle.occurs.max !== '1' ? v.map(v=>child(v,slot)) : child(v,slot);
      }
      return result;
    }
    type Entry = {name:{namespace:string;local:string};value:unknown};
    const entries: Entry[] = direction === 'from-native' ? data.$content as Entry[] : [];
    let cursor = 0;
    const first = (n: GroupNode): Set<string> => n.slot ? new Set([n.slot.element.name.local]) : new Set(n.children.flatMap(c=>[...first(c)]));
    const starts = (n: GroupNode) => entries[cursor] && first(n).has(entries[cursor]!.name.local);
    const encodeObject = (nodes: readonly GroupNode[], data: Data, extra: readonly string[] = []): void => {
      const keys = new Set(extra);
      const encode = (n: GroupNode): void => {
        check();
        if (n.slot) {
          const key = n.slot.element.name.local; keys.add(key);
          const present = Object.hasOwn(data,key), v = data[key];
          const list = !present ? [] : n.particle.occurs.max !== '1' ? Array.isArray(v) ? v : fail('group-leaf-array-required') : [v];
          bounds(list.length,n.particle);
          for (const item of list) entries.push({name:n.slot.element.name,value:child(item,n.slot)});
        } else if (!n.target) for (const c of n.children) encode(c);
        else {
          const key = n.target.resolved.propertyName!; keys.add(key);
          const v = data[key], list = !Object.hasOwn(data,key) ? [] : n.particle.occurs.max !== '1' ? Array.isArray(v) ? v : fail('group-array-required') : [v];
          bounds(list.length,n.particle);
          for (const item of list) {
            const body = object(item);
            if (n.particle.kind === 'choice') {
              // @why Disjoint native leaf alphabets select one branch; full body validation still rejects partial or mixed branches.
              const candidates = n.children.filter(c=>hasSelection(c,body));
              if (candidates.length !== 1) fail('group-choice-branch');
              encodeObject(candidates[0]!.children,body);
            } else encodeObject(n.children,body);
          }
        }
      };
      for (const n of nodes) encode(n);
      if (Object.keys(data).some(k=>!keys.has(k))) fail('unknown-application-group-key');
    };
    const hasSelection = (node: GroupNode, data: Data): boolean => {
      check();
      if (node.slot) return Object.hasOwn(data,node.slot.element.name.local);
      if (!node.target) return node.children.some(child=>hasSelection(child,data));
      const key=node.target.resolved.propertyName!;
      if (!Object.hasOwn(data,key)) return false;
      const member=data[key],items=node.particle.occurs.max==='1'?[member]:Array.isArray(member)?member:[];
      // @why Synthetic keys may be equal in different alternatives; only disjoint native leaf sites identify a branch.
      return items.some(item=>!!item && typeof item==='object' && !Array.isArray(item)
        && node.children.some(child=>hasSelection(child,item as Data)));
    };
    const decodeObject = (nodes: readonly GroupNode[]): Data => {
      const out: Data = Object.create(null) as Data;
      const decode = (n: GroupNode): void => {
        check();
        if (n.slot) {
          const items: unknown[] = [];
          while (entries[cursor]?.name.local === n.slot.element.name.local && (n.particle.occurs.max === 'unbounded' || BigInt(items.length) < BigInt(n.particle.occurs.max))) items.push(child(entries[cursor++]!.value,n.slot));
          bounds(items.length,n.particle);
          if (items.length || n.particle.occurs.max !== '1' && n.particle.occurs.min !== '0') out[n.slot.element.name.local] = n.particle.occurs.max !== '1' ? items : items[0];
        } else if (!n.target) for (const c of n.children) decode(c);
        else {
          const items: Data[] = [];
          while (starts(n) && (n.particle.occurs.max === 'unbounded' || BigInt(items.length)<BigInt(n.particle.occurs.max))) {
            const before = cursor;
            const branch = n.particle.kind === 'choice' ? n.children.find(starts) : undefined;
            items.push(decodeObject(branch ? branch.children : n.children));
            if (cursor === before) fail('zero-width-application-group');
          }
          bounds(items.length,n.particle);
          if (items.length) out[n.target.resolved.propertyName!] = n.particle.occurs.max !== '1' ? items : items[0];
        }
      };
      for (const n of nodes) decode(n);
      return out;
    };
    const extras = [...record.attributes.filter(a=>!a.bag).map(a=>a.declaration.name.local), ...(record.attributes.some(a=>a.bag)?['$attributes']:[]),
      ...(record.contextual?['$namespaces']:[]), ...(Object.hasOwn(data,'$namespace')?['$namespace']:[])];
    if (direction === 'to-native') {encodeObject(group.children,data,extras); for (const key of Object.keys(result)) if (!extras.includes(key)) delete result[key]; result.$content=entries;}
    else {
      delete result.$content;
      // @why Source fields are own data: assignment to __proto__ would invoke an inherited setter and discard the field.
      Object.defineProperties(result,Object.getOwnPropertyDescriptors(decodeObject(group.children)));
      if (cursor!==entries.length) fail('group-particle-language');
    }
    return result;
  };
  return value(input,projection.root,0);
}
