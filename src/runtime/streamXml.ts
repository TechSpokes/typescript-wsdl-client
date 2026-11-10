/**
 * Streaming SOAP-payload to record iterator.
 *
 * Phase 3 of ADR-002. Driven by saxes (chunk-boundary safe — proven in
 * research/tests/sax-record-path.test.ts) and the compiled-catalog metadata
 * that the buffered client already relies on. The parser accepts an async
 * iterable of bytes/strings (typically an upstream SOAP HTTP response) and
 * yields fully-materialized record objects as the corresponding end tags
 * close. Consumers never see partial records.
 *
 * Open questions resolved here:
 *   Q3 (terminal error policy): stream aborts. Errors that happen before the
 *        first record bubble out as a rejected promise from the first
 *        iterator.next(). Errors after a record was emitted throw from a
 *        later iterator.next() — callers are expected to treat that as a
 *        truncated stream.
 *   Q4 (saxes placement): runtime dependency of the wsdl-tsc package; the
 *        generated client imports the emitted copy of this module and
 *        inherits saxes via its own dependency tree.
 * @since Unreleased
 */
import {SaxesParser, type SaxesTagPlain} from "saxes";

/**
 * Catalog-driven parse specification. `recordPath` is an ordered XML element
 * path from the SOAP body payload down to the repeated record element. The
 * path is matched as a suffix of the open-tag stack, so callers may either
 * pre-strip the SOAP envelope or feed the entire response body.
 *
 * Duplicate local names in `recordPath` are supported and expected (Escapia's
 * EVRN content service nests two elements named `EVRN_UnitDescriptiveInfoRS`).
 */
export interface RecordParseSpec {
  recordPath: string[];
  /** TypeScript type name of the record, used to look up propMeta. */
  recordTypeName: string;
  /** Attribute bag key to stash XML attributes under. Defaults to "$attributes". */
  attributesKey?: string;
  /**
   * Compiled-catalog child-type map: `childType[typeName][propName] = tsType`.
   * Used to descend into nested complex types and to detect array-valued
   * props (trailing `[]`). Optional — absent means occurrence-based array
   * detection only.
   */
  childType?: Record<string, Record<string, string>>;
  /** Explicit repeated XML properties; when supplied, child-type [] hints describe list values instead. */
  repeatedElements?: Record<string, readonly string[]>;
  /**
   * Compiled-catalog prop-meta map: carries min/max/nillable/declaredType.
   * When present, `max > 1` or `max === "unbounded"` drives array emission
   * even for props that happen to occur just once in a given record.
   */
  propMeta?: Record<string, Record<string, PropMeta>>;
}

export interface PropMeta {
  min?: number;
  max?: number | "unbounded";
  nillable?: boolean;
  declaredType?: string;
}

/**
 * Consume XML bytes or strings and yield complete legacy record nodes.
 * @param source - Single-pass XML bytes or strings; UTF-8 byte boundaries may split characters.
 * @param spec - Local-name record path and optional catalog metadata; attribute bags remain lexical strings.
 * @returns Complete records without buffering the complete XML document.
 * @throws Error for malformed XML, SOAP Body faults, or an empty record path.
 * @constraints Exhaust or return the single-pass iterator to release its source; undeclared xsi:nil remains accepted for legacy compatibility.
 */
export async function* parseRecords<T = unknown>(
  source: AsyncIterable<string | Uint8Array>,
  spec: RecordParseSpec,
): AsyncIterable<T> {
  const parser = new SaxesParser({xmlns: false, position: false});
  const recordPath = spec.recordPath;
  if (recordPath.length === 0) {
    throw new Error("parseRecords: recordPath must not be empty");
  }
  const attrsKey = spec.attributesKey ?? "$attributes";
  const decoder = new TextDecoder("utf-8");

  // Global tag stack, maintained across the entire document.
  const stack: string[] = [];
  const namespaces: Array<Record<string, string>> = [];
  const elementNamespaces: string[] = [];
  // Records materialized during the current chunk write, awaiting yield.
  const pending: T[] = [];
  // When a parser.on('error') fires we buffer the error for re-throw on the
  // next yield cycle; saxes emits 'error' and continues unless we stop it.
  let parseError: Error | null = null;

  // While we're inside the record element (stack tail matches recordPath),
  // we maintain a stack of "open" element nodes capturing their XML shape.
  interface OpenNode {
    obj: Record<string, unknown>;
    /** Type name for `childType`/`propMeta` lookup on direct children. */
    typeName: string | null;
    /** Name this node was opened as, in the parent object. null for the record root. */
    propName: string | null;
    /** Accumulated text content (including CDATA). */
    textBuf: string[];
    /** True once we've seen at least one child element — distinguishes leaves from containers. */
    hadChildren: boolean;
    /** xsi:nil="true" marker → materialize as null regardless of content. */
    isNil: boolean;
  }
  const openNodes: OpenNode[] = [];

  parser.on("opentag", (tag: SaxesTagPlain) => {
    const inherited = namespaces.at(-1);
    const scope: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, inherited);
    for (const [name, value] of Object.entries(tag.attributes)) {
      if (name === "xmlns") scope[""] = value;
      else if (name.startsWith("xmlns:")) scope[name.slice(6)] = value;
    }
    const localName = local(tag.name);
    const prefix = tag.name.includes(":") ? tag.name.slice(0, tag.name.indexOf(":")) : "";
    const namespace = scope[prefix] ?? "";
    if (localName === "Fault" && namespace === elementNamespaces.at(-1) &&
      (namespace === "http://schemas.xmlsoap.org/soap/envelope/" || namespace === "http://www.w3.org/2003/05/soap-envelope") &&
      stack.at(-1) === "Body") {
      parseError = new Error("SOAP Fault received in stream response");
    }
    namespaces.push(scope);
    elementNamespaces.push(namespace);
    stack.push(localName);
    if (openNodes.length === 0) {
      // Not yet inside a record. Check whether entering the path tail.
      if (tailMatches(stack, recordPath)) {
        openNodes.push(newNode(tag, spec.recordTypeName, null, attrsKey, scope));
      }
      return;
    }
    // Inside a record: descend.
    const parent = openNodes[openNodes.length - 1];
    parent.hadChildren = true;
    const parentType = parent.typeName;
    const childTypeRaw = parentType ? spec.childType?.[parentType]?.[localName] : undefined;
    const childTypeName = childTypeRaw ? stripArraySuffix(childTypeRaw) : null;
    openNodes.push(newNode(tag, childTypeName, localName, attrsKey, scope));
  });

  const appendText = (t: string) => {
    if (openNodes.length > 0) openNodes[openNodes.length - 1].textBuf.push(t);
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);

  parser.on("closetag", (_tag: SaxesTagPlain) => {
    if (openNodes.length > 0) {
      const closing = openNodes.pop()!;
      const value = materialize(closing, attrsKey);
      if (openNodes.length === 0) {
        // We just closed the record root. Stack tail must match once more.
        if (tailMatches(stack, recordPath)) {
          pending.push(value as T);
        }
      } else {
        assignChild(openNodes[openNodes.length - 1], closing.propName!, value, spec);
      }
    }
    stack.pop();
    namespaces.pop();
    elementNamespaces.pop();
  });

  parser.on("error", (err: Error) => {
    parseError = err;
  });

  try {
    for await (const chunk of source) {
      if (parseError) throw parseError;
      const text = typeof chunk === "string" ? decoder.decode() + chunk : decoder.decode(chunk, {stream: true});
      parser.write(text);
      if (parseError) throw parseError;
      while (pending.length > 0) {
        yield pending.shift()!;
      }
    }
    parser.write(decoder.decode());
    parser.close();
    if (parseError) throw parseError;
    while (pending.length > 0) {
      yield pending.shift()!;
    }
  } finally {
    // Best-effort cleanup: detach handlers so the parser can be GC'd even
    // when the consumer aborts iteration early.
    parser.off("opentag");
    parser.off("closetag");
    parser.off("text");
    parser.off("cdata");
    parser.off("error");
  }
}

function newNode(
  tag: SaxesTagPlain,
  typeName: string | null,
  propName: string | null,
  attrsKey: string,
  namespaces: Record<string, string>,
): {
  obj: Record<string, unknown>;
  typeName: string | null;
  propName: string | null;
  textBuf: string[];
  hadChildren: boolean;
  isNil: boolean;
} {
  const attrs = tag.attributes;
  const obj: Record<string, unknown> = {};
  let isNil = false;
  const attrKeys = Object.keys(attrs);
  if (attrKeys.length > 0) {
    // Detect xsi:nil and drop it from the attribute bag — it's a wire-level
    // concern that should not pollute the user-visible record.
    const cleaned: Record<string, string> = {};
    for (const k of attrKeys) {
      if (k === "xmlns" || k.startsWith("xmlns:")) continue;
      const prefix = k.includes(":") ? k.slice(0, k.indexOf(":")) : "";
      const isNilAttribute = k === "nil" || k === "xsi:nil" && !namespaces.xsi ||
        local(k) === "nil" && namespaces[prefix] === "http://www.w3.org/2001/XMLSchema-instance";
      if (isNilAttribute && (attrs[k] === "true" || attrs[k] === "1")) {
        isNil = true;
        continue;
      }
      cleaned[k] = attrs[k];
    }
    if (Object.keys(cleaned).length > 0) {
      obj[attrsKey] = cleaned;
    }
  }
  return {
    obj,
    typeName,
    propName,
    textBuf: [],
    hadChildren: false,
    isNil,
  };
}

function materialize(
  node: {obj: Record<string, unknown>; textBuf: string[]; hadChildren: boolean; isNil: boolean},
  attrsKey: string,
): unknown {
  if (node.isNil) return null;
  if (!node.hadChildren) {
    // Leaf with no child elements: it's simple text. Preserve attributes via
    // a `$value` pairing when present, mirroring how the buffered mapper
    // surfaces simpleContent-with-attributes types.
    const text = node.textBuf.join("");
    if (attrsKey in node.obj) {
      return {...node.obj, $value: text};
    }
    return text;
  }
  return node.obj;
}

function assignChild(
  parent: {obj: Record<string, unknown>; typeName: string | null},
  propName: string,
  value: unknown,
  spec: RecordParseSpec,
): void {
  const parentType = parent.typeName;
  const propMetaEntry = parentType ? spec.propMeta?.[parentType]?.[propName] : undefined;
  const childTypeHint = parentType ? spec.childType?.[parentType]?.[propName] : undefined;

  // @constraints Explicit repetition metadata distinguishes inline xs:list values from repeated XML elements.
  const metaSaysArray =
    propMetaEntry?.max === "unbounded" ||
    (typeof propMetaEntry?.max === "number" && propMetaEntry.max > 1);
  const hintSaysArray = spec.repeatedElements === undefined && !!childTypeHint && childTypeHint.endsWith("[]");
  const declaredRepeated = parentType ? spec.repeatedElements?.[parentType]?.includes(propName) : false;
  const existing = parent.obj[propName];
  const slotTaken = existing !== undefined;

  if (metaSaysArray || hintSaysArray || declaredRepeated) {
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (slotTaken) {
      parent.obj[propName] = [existing, value];
    } else {
      parent.obj[propName] = [value];
    }
    return;
  }
  if (slotTaken) {
    // Schema said scalar but the wire repeated it. Promote to array rather
    // than drop data.
    if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      parent.obj[propName] = [existing, value];
    }
    return;
  }
  parent.obj[propName] = value;
}

function stripArraySuffix(tsType: string): string {
  return tsType.endsWith("[]") ? tsType.slice(0, -2) : tsType;
}

function tailMatches(stack: string[], path: string[]): boolean {
  if (stack.length < path.length) return false;
  const offset = stack.length - path.length;
  for (let i = 0; i < path.length; i++) {
    if (stack[offset + i] !== path[i]) return false;
  }
  return true;
}

function local(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}
