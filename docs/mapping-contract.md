# Checked XML/JSON Mapping Contract

Source-derived JSON representation for checked generation. See the root [README](../README.md) and [checked gateway guide](checked-gateway.md) for supported scope and configuration.

The checked gateway guide defines executed support. Selected future forms are labeled below; describing a JSON shape does not enable a missing source or runtime capability.

## Selected keyed mapping contract

Names are JSON keys. Derive identity facts from the exact source mapping whenever a slot uniquely identifies them, including qualified attributes inside a fallback channel. Known records/scalars/arrays and reconstructible application groups remain ordinary values; source occurrence bounds choose arrays for compact slots, while each ordered entry is exactly one element occurrence. JSON property insertion order never controls source-fixed XML order. Existing scalar encodings, lexical witnesses and native duties remain authoritative.

Keyed child entries keep familiar field names, text objects make every ordered entry an object without a kind discriminator, direct URI holders handle actual identity choices, and scoped binding deltas avoid repeated full maps. Attribute entries preserve same-name/different-namespace identities without inventing a key-escaping syntax. Existing supported projections do not acquire redundant descriptors; the repository's [exploratory comparison](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/docs/v1.0-xml-json-mapping.md#bounded-primary-source-comparison) records the alternative forms considered.

### Content and recursion

New mixed/open `$content` is an ordered array of objects. Each object has exactly one own property: either `$value` with a text string, or an ordinary child-name key whose value follows that child's selected mapping. No metadata siblings are allowed on an outer entry. Preserve significant spaces; coalesce adjacent text entries and remove zero-length text entries. Do not collapse repeated occurrences across intervening text. An XSD list scalar array is distinct from element repetitions.

```xml
<p xmlns="urn:msg" id="7">Hello <b>world</b>!</p>
```

```json
{"id":"7","$content":[{"$value":"Hello "},{"b":"world"},{"$value":"!"}]}
```

Here the source declares b as string. A mixed structured b instead has its own `$content`, even when one instance is text-only. Source identity/assessment selects the grammar, not object appearance. Metadata around a scalar encoding v uses a holder with `$value:v`, including object/array scalar encodings; never merge scalar fields into element metadata. A record keeps its own fields. An ordered holder cannot also expose peer child/group fields or a scalar `$value`; source-mapped attributes may accompany it.

### Namespaces have separate owners

`$namespace` is the actual element/attribute/type namespace URI at this location. It does not declare a prefix, set a default binding or cause descendants to inherit element identity. Derive it when the exact source mapping fixes identity; otherwise supply it explicitly, including an empty URI for a no-namespace unknown element. Each child key is its XML name without the prefix unless an established source mapping defines an application alias.

```json
{"$content":[{"code":{"$namespace":"urn:vendor","$value":"A"}},{"code":{"$namespace":"urn:billing","$value":"B"}}]}
```

`$namespaces` contains prefix bindings introduced/rebound on this node. Descendants inherit an immutable effective context and apply their local changes; parents and siblings stay unchanged. The first source-defined retained-context boundary captures otherwise unavailable effective bindings; subsequent nodes retain only deltas. A source-known intermediate node retains a delta when a descendant needs it. Prefix keys are data: `""` denotes the default binding and xml is implicit. Default reset uses `{"":""}`; XML Namespaces 1.0 does not permit deleting nonempty prefixes. Redundant deltas normalize away; apparently unused bindings in unassessed data are not pruned.

Element identity and default binding can differ: `<e:extra xmlns:e="urn:open" xmlns="urn:values">Thing</e:extra>` identifies the element in urn:open while a typed QName Thing resolves in urn:values. A child rebinding p changes its applicable lexical scope, not its element URI. Plain unassessed `p:Thing` remains a string; neither object appearance nor a colon grants QName semantics.

For assessed data without retained context, the codec can allocate compatible prefixes from actual identities. It must preserve protected effective contexts for unassessed lexical data and lexical witnesses. Reject combinations that cannot coexist in XML, including a no-namespace element retaining a nonempty default or a namespaced attribute lacking an available nonempty prefix in a protected scope. JSON shape alone does not establish these codec duties. Fresh reconstruction uses complete JSON, source mapping and inherited context; arbitrary extracted-subtree portability is not promised.

### Attribute channel

Existing unambiguous source-mapped peer attributes retain their shape. When a source mapping requires the new fallback, `$attributes` is an array of one-name entries, not an array of generic name/value descriptors. At a uniquely mapped key, a bare scalar derives its complete identity from that source slot, including a qualified namespace; redundant identity holders are rejected.

A closed source with one qualified code attribute and one code child can therefore use `{"$attributes":[{"code":"attribute"}],"code":"child"}`. For an open/unresolved key without a unique mapped identity, a bare scalar denotes an unqualified attribute and a qualified identity uses `{$namespace:nonemptyURI,$value:scalar}`. Empty-URI holders are rejected in that open grammar rather than being a second spelling.

A source key whose permitted identities remain ambiguous requires the explicit namespace selection needed to distinguish them; its generated mapping/schema declares that domain. Unknown attributes retain lexical strings; typed values use their selected scalar encodings. The bag never infers attribute identity from the default element namespace.

```json
{"$attributes":[{"id":"attribute"},{"id":{"$namespace":"urn:vendor","$value":"external"}}],"id":"child"}
```

The container preserves two attributes with the same name from different namespaces without inventing escaping rules or aliases. Source-owned slot attribution determines whether an identity is already fixed; object appearance does not override that attribution. Attribute order is not semantic; canonical output sorts by expanded identity. Duplicate expanded attributes, duplicate peer/bag identities, undeclared attributes and invalid values fail. A selected type uses one placement consistently across nil/non-nil instances. No attribute holder owns children, `$nil` or `$type`.

### Open values, type and nil

Genuinely unassessed elements always use ordered holders, including empty/text-only instances, with their required identity and retained context. They do not become guessed scalar types. Native assessment applies independently to each location: strict/lax/skip cannot be selected by a JSON flag. Raw unassessed xsi:nil/xsi:type stay lexical attributes in the XSI namespace, not semantic `$nil`/`$type`. Missing declarations are not repaired by an open representation.

The selected research shape for a future assessed dynamic type is the flat XML identity `{$type:{$name:"Dog",$namespace:"urn:animals"}}`. Assessed dynamic `$type` execution and its `$name` identity field remain unsupported by the generated checked pipeline; this shape is not an accepted capability switch. A child entry already has its name as its key, and no `$localName`, `$kind`, `$text` or `$element` alias is allocated.

Display type/schema aliases do not rename an XML type. Any future implementation must establish native existence, derivation and attribute duties before admitting the selected research shape.

The explicit nil contract below remains authoritative. Identity/type/context metadata can accompany nil only when that exact source mapping declares the necessary combination and implements its native duties; it is not admitted by the nil marker alone. Nil forbids every text/child/group content field, even empty content. Neither semantic xsi processing nor QName scalar assessment is guessed from familiar names.

### Compatibility, HTTP shape and implementation proof

New grammar selection is per exact source declaration/type/assessment mapping. Legacy, accepted component scalar/record/array/simple/ordered values and checkedDirectRuntimeV1 remain unchanged. A reused already-accepted ordered descendant inside a new mixed parent retains its old entry grammar in both directions; the implementation dispatches through its existing mapping. Unifying those old public shapes requires a separate migration decision, not a new mode introduced here.

HTTP schemas describe actual JSON fields and source-selected recursive alternatives, with closed one-property entries, text string slots, namespace strings, flat type identity and nil/attribute/content exclusions. Named structured choice alternatives reference their union, or an array of it for repetition. Use oneOf only where JSON alternatives are disjoint. Native owners enforce names, bindings, particles/correlation, scalar/default/fixed/type/nil duties and SOAP construction. Serialization must independently preserve every accepted field. Reject unknown metadata and invalid combinations without mutation, coercion, default insertion or field removal; legal __proto__/constructor names remain safe own data properties.

The [keyed prototype](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/tests/xml-json-mapping/keyed-mapping.ts) and [independent examples](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/tests/xml-json-mapping/keyed-mapping.test.ts) reuse the earlier parser/syntax inverse and its fixture-specific source facts. They exercise mixed/nested text, order and namespace collisions, scopes/defaults/siblings, attribute collisions, raw xsi values, safe names, flat type and explicit nil, with malformed-input and realizability controls. The [qualified attribute fixture](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/tests/xml-json-mapping/keyed-attributes.xsd) supplies a closed same-name attribute/child case whose qualified attribute identity is independently checked through native source attribute assessment; unassessed data with the same root name must retain its open grammar.

The [HTTP structure sketches](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/tests/xml-json-mapping/keyed-schema.test.ts) execute recursive JSON Schema examples and rejection/non-mutation cases. They are not a generic source-to-DTO generator or production native validation; existing native projection/scalar controls and nil examples remain separate evidence. The old public candidate grammar is historical; its fixture-specific conversion helpers remain dependencies of the research adapter, not an independent new inverse.

The [checked nil implementation](checked-gateway.md#nil-values) and [keyed execution](checked-gateway.md#mixed-namespaced-and-open-values) supply the supported nil/mixed/open slices and preserve them through HTTP. Scalar/context validation and HTTP-shape generation retain their separate native duties. Application groups and configured aliases are described below and in the checked gateway guide.

## Selected nil contract

Checked nil values use one explicit object, preserving attributes and the distinction between absent, empty and nil elements. This contract does not change legacy, accepted non-nil component values or `checkedDirectRuntimeV1`; the [checked nil reference](checked-gateway.md#nil-values) records supported configuration and limits.

| Case | JSON rule |
|---|---|
| Absent optional element | Omit its property; omission is not nil |
| Present nil without attributes | `{"$nil":true}` |
| Present nil with attributes | `{"$nil":true,"id":"7"}` for an applicable mapped string attribute `id` |
| Empty non-nil | Retain the ordinary source-selected value, such as `""`, `{"$value":""}` or an empty permitted record |
| Nil repeated item | Put the explicit nil object at that item's position in the declared array |
| Nil wrapper | Put the explicit nil object at the wrapper element's property; it contains no items |

Both accepted input and canonical output use the explicit object; plain `null` is rejected, including as an array item. `$nil` is exactly Boolean `true`, never false, a string or a caller-selected assessment policy. XML `xsi:nil="true"` and `"1"` project to this same marker after native lexical assessment. XML false/zero uses the ordinary non-nil projection with no `$nil`; reconstruction of nil uses a permitted canonical true lexical form. Property order does not control XML order.

The only newly allocated nil metadata is `$nil`. Additional fields are exactly the applicable attribute properties already defined by the selected source mapping, using their existing scalar encodings and identities. Required attributes remain required on nil elements; optional/default/fixed attributes follow the shared native assessment and adopted augmentation rules, not Ajv defaults. Empty string attributes are data and remain subject to their type. Do not invent a new nil attribute bag or rename existing scalar descriptors. Contextual attribute families, attribute collisions/wildcards and dynamic types require their actual native owners and an explicit compatible shape before emission; the nil marker alone does not establish those capabilities or silently narrow #421's acceptance.

Nil objects prohibit all element/text/group content fields, including `$value`, `$content`, synthetic choice containers and ordinary child properties, even when their supplied values are empty or null. Reject unknown metadata, undeclared/invalid attributes, sparse/malformed arrays and object/array substitutions without mutation or silent field removal. `$type` and `$namespaces` are not implicitly accepted by this nil contract. A later independently selected contextual/type contract must explicitly describe its combination with nil; callers cannot enable it with extra keys.

Each object's XML element identity comes from its selected declaration/position; `$nil` never emits an XML child. Nillability, nil/content legality, attribute use and applicable fixed/default/scalar duties remain native checks, at the actual item or wrapper element. Genuinely unassessed lexical xsi attributes are not promoted to semantic nil by familiar spelling. No checked failure may fall back to legacy conversion, and no missing native duty may be hidden by weakening validation.

For the example with optional string attribute `id`, TypeScript is `{ $nil: true; id?: string }`. Its HTTP schema is concrete:

```json
{"type":"object","required":["$nil"],"additionalProperties":false,"properties":{"$nil":{"const":true},"id":{"type":"string"}}}
```

Include `id` in `required` where the source requires it. Compose this nil schema with the ordinary non-nil schema for a nillable element, with exactly-one composition only when the JSON alternatives are disjoint. Optionality belongs to the containing property and item versus wrapper nillability belongs to the corresponding element position. Every accepted attribute must survive response serialization; HTTP structure validation does not replace native XML checks. No discriminator, response envelope or new runtime mode is introduced.

The [explicit nil contract examples](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/tests/xml-json-mapping/nil-contract.test.ts) exercise independent hand JSON, true/one XML lexicals, attribute-preserving fresh syntax reconstruction, canonical explicit output, absent/empty/item/wrapper distinctions and malformed combinations. They reuse the existing parser and research inverse for a fixture with string `id`; they do not implement native nillability, complete attribute semantics or generated HTTP/SOAP execution. The old null-based tests remain historical candidate evidence, not accepted aliases.

The implementation consumes this contract through existing source planning, projection/inverse, codec and HTTP-shape generation, preserving shared resource and error boundaries. Its [codec controls](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/unit/direct-projection-nil.test.ts) and [installed gateway checks](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/helpers/checkedGatewayInstalledProcess.ts) supply independent request/response/fault, serialized HTTP and owned-SOAP evidence, including non-nillable/content-bearing refusals and attribute/default/fixed duties.

## Application groups

Checked generation implements opt-in source-derived application groups and definition-scoped configured names. [Configuration and compatibility](checked-gateway.md#application-groups-and-configured-names), [the production fixture](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/conformance/fixtures/assessment/application-groups.wsdl), [native inverse controls](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/unit/application-groups.test.ts) and [pipeline/reload evidence](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/checked-application-groups.test.ts) provide regression evidence; installed HTTP/SOAP checks cover both defaults and configured aliases. Wider native source, dynamic-type and protocol duties retain their documented limits.

Reconstructible singleton/repeated/nested choices, repeated sequences, independent sites, cross-record named-group reuse and finite recursive references share the source-owned mapping. Empty-capable and ambiguous records retain ordered normalization; mixed/open records keep their selected owner. Inventory tokens include a selected-record shape guard and survive physical relocation, unrelated declaration reorder and alias changes; relevant source edits require copying fresh targets.
