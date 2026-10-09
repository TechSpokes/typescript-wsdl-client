# Ordered Schema Loading

Internal S03 input contracts for the unreleased faithful compiler. See the root [README](../README.md).

## Ownership and compatibility

[ADR-003 D01/D04/D09](decisions/003-content-model-contracts.md) owns the input, profile and budget decisions.
The [decision register](content-model-decisions.md) assigns the later semantic consumers.
The [ordered syntax adapter](../src/loader/orderedSyntax.ts) implements #171; #172 consumes this boundary for controlled resolution.

This internal adapter is not exported from the package entry point or activated by the CLI.
The existing [WSDL loader](../src/loader/wsdlLoader.ts) remains the legacy default while #174 owns later routing.
Parsing XML syntax does not certify XSD legality, resolve declarations, or establish payload validity.

## Syntax and provenance contract

`parseOrderedSyntax(bytes, absoluteUri, {maxDepth})` returns an immutable `SyntaxDocument` with `root`, full `uri` and SHA-256 `digest` of original bytes.
`SyntaxElement.children` retains text and element order across every compositor kind; no name-keyed grouping occurs.
Annotations, occurrence strings, declaration form settings and lexical attribute values remain available for their later owners.

Each element retains its expanded `name`, `lexicalName`, ordinary attributes, all in-scope `namespaces`, effective `baseUri` and `source`.
Namespace declarations populate context rather than ordinary attributes.
Default namespaces apply to element names; unprefixed attribute names have an empty namespace.

`resolveLexicalQName(value, element)` resolves QName-valued attributes or text in the declaring element's namespace context, including the default binding.
It rejects malformed lexical names and unbound prefixes, without echoing lexical values in diagnostics.
`syntaxElements` filters direct element children by expanded name while retaining order; `syntaxAttribute` retrieves an expanded attribute name.

`source` contains full document URI, digest, stable source-relative syntax path and start/end positions.
Lines and columns are one-based; offsets are zero-based UTF-16 positions in decoded XML and end offsets are exclusive.
Syntax paths distinguish local declarations in different containing types; they are not global symbol identities.
S04 owns global `(namespace, local, role)` identities and containing-declaration identities for locals.

`baseUri` begins at the supplied final retrieval URI and inherits each `xml:base` through URL-reference resolution.
For a document at `https://example.test/contracts/root.xsd`, `xml:base="../types/"` gives `https://example.test/types/`.
The syntax adapter computes this context without performing I/O; #172 must authorize each resolved fetch.

## Syntax limits and diagnostics

The default nesting budget is 256 elements, inclusive, checked before accepting the next element.
`SchemaLoadingError` distinguishes `invalid-schema`, `unsupported-capability`, `resource-limit` and `transport`; syntax errors carry source context.
The adapter rejects DTDs, entity declarations and unresolved entity references, while accepting XML's predefined and numeric character references.

UTF-8 and BOM-marked UTF-16 are decoded strictly; unsupported declared encodings fail explicitly.
Comments and processing instructions are outside XML-value fidelity and omitted; CDATA retains its text.
The parser dependency is confined to this module; consumers receive repository-owned types.

## Evidence and reproduction

[Ordered syntax tests](../test/unit/ordered-syntax.test.ts) reuse independently qualified S01 compositor and S02 ordered SOAP inputs.
[Syntax fixtures](../test/conformance/fixtures/xsd/syntax/ordered-namespaces.xsd) and their [default-namespace equivalent](../test/conformance/fixtures/xsd/syntax/default-namespaces.xsd) exercise interleaving, annotations, rebinding, lexical QNames and distinct local paths.
These syntax fixtures establish input preservation; later graph/profile tasks own semantic schema assessment.

```bash
npx vitest run test/unit/ordered-syntax.test.ts --reporter=verbose
npx tsc -p test/unit/tsconfig.json
npm run ci
```

Depth 256 succeeds and depth 257 fails with `resource-limit`; lower configured limits and malformed XML fail explicitly.
Tests also preserve the legacy relative-import fixture and validate source locations/digests and strict byte decoding.
Exact reviewed commits, executed aggregate results and measured limits are recorded in #150's final S03 handoff.
