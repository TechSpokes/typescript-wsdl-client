# File Naming And Path Organization

Contributor guide for naming files and organizing fixture paths. See the root [README.md](../README.md) for the authoritative documentation index.

## Purpose

Paths should classify files before a reader opens them. The left side of a path carries the broadest concept; each segment to the right narrows the classification until the filename states the exact artifact purpose.

This convention is especially important for conformance fixtures. A maintainer should be able to search or list paths and see which WSDL, XSD, SOAP, policy, and recovery concepts already have evidence.

## Authority Model

This convention borrows from resource-oriented API design. REST APIs commonly use noun-based paths, hierarchy through `/`, and readable lowercase path segments.

Google AIP-122 describes resource names as slash-separated paths and says collection identifiers are usually plural nouns. Zalando REST guidelines require plural resource names, kebab-case path segments, verb-free URLs, and domain-specific resource names. Microsoft Azure API guidelines prefer kebab-casing for URL path segments. REST URI naming guidance uses nouns for resources, `/` for hierarchy, and hyphens for readability.

Filesystem paths are not REST APIs, but the same retrieval model applies: a path is a resource name for a contributor, a terminal command, an IDE index, and an agent.

## Shell Examples

Use `bash` fences for portable command examples in repository documentation and GitHub workflow notes. Use `powershell` fences only when the command is intentionally Windows-specific.

Prefer `rg` for retrieval examples because agents already use it for fast file and content search. Write path filters so they tolerate `/` and `\` separators when possible.

On Windows PowerShell, keep `rg` regex arguments in single quotes when the pattern contains backslashes, brackets, or alternation. The examples in this document were checked in PowerShell with single-quoted regexes. A no-match `rg` filter exits with code `1`; that is expected for negative checks such as confirming `service.wsdl` is absent.

## Progressive Discovery

Start broad, then narrow. A path should answer these questions from left to right:

1. What repository area owns this artifact?
2. What artifact family is this?
3. What standards domain or product domain does it belong to?
4. What feature family does it exercise?
5. What exact purpose does the file serve?

For conformance fixtures, this means the preferred shape is:

```text
test/conformance/fixtures/<domain>/<feature-family>/<feature-name>.<ext>
```

Use deeper nesting only when it improves retrieval. Do not create a folder level that only repeats the filename.

## Folder Names

Folder names are taxonomy terms. They classify a set of files.

- Use lowercase kebab-case.
- Prefer one noun per segment.
- Prefer plural nouns when the term is naturally countable.
- Preserve standards terms when pluralizing them would reduce clarity.
- Avoid verbs, implementation steps, and filler words.
- Place the broadest useful classifier on the left.
- Add a narrower folder only when it groups multiple related files or distinguishes a standards boundary.

Acceptable standards-domain folders include `wsdl`, `xsd`, `soap`, `ws-policy`, `ws-security`, `interop`, and `recovery`.

Acceptable feature-family folders include `types`, `elements`, `bindings`, `policies`, `attachments`, `wildcards`, `compositors`, `sequences`, and `choices`.

## File Names

File names state the exact purpose and content of the artifact. They should remain useful when shown without the full path.

- Use lowercase kebab-case.
- Use general-to-specific segment order.
- Put the broad feature classifier first.
- Put variable-like qualifiers at the right side.
- Keep recognized standards terms when they identify the feature.
- Avoid filler words such as `service`, `sample`, `fixture`, and `test`.
- Use the file extension to identify format, not the basename.

Good file names classify sorted terminal output:

```text
attachment-mtom-xop.wsdl
binding-soap-first-multi.wsdl
choice-union-simple.wsdl
element-substitution-group.wsdl
policy-reference-external.wsdl
sequence-composition-deep.wsdl
type-complex-abstract-extension.wsdl
type-union-simple.wsdl
wildcard-attribute-any.wsdl
```

Avoid names that only read naturally in English but group poorly in file listings:

```text
abstract-complex-type-extension.wsdl
any-attribute.wsdl
deep-sequence-composition.wsdl
mtom-xop-attachment.wsdl
multi-binding-first-soap.wsdl
xs-union-simple-type.wsdl
```

## Conformance Fixtures

Conformance fixtures should be committed XML files, not inline strings in tests. Inline XML is acceptable only for throwaway probes or very small unit tests that do not represent a reusable fixture.

The fixture path should support discovery by partial path search. A contributor should be able to search `xsd/wildcards`, `soap/attachments`, or `wsdl/bindings` and see what exists.

The registry ID should remain stable for test reporting. The fixture path may use taxonomy folders and a more precise filename when that improves retrieval.

## Multi-file Fixtures

Use a folder when a fixture needs a root WSDL plus imported schemas or companion files. Keep the root filename aligned with the feature name.

```text
test/conformance/fixtures/xsd/wildcards/wildcard-attribute-any.wsdl
test/conformance/fixtures/xsd/wildcards/wildcard-attribute-any-types.xsd
test/conformance/fixtures/xsd/wildcards/wildcard-attribute-any-shared.xsd
```

Use purpose suffixes such as `types`, `messages`, `shared`, `policy`, and `binding` for companion files.

## Retrieval Examples

List every conformance fixture path:

```bash
rg --files test/conformance/fixtures | sort
```

Find every XSD wildcard fixture:

```bash
rg --files test/conformance/fixtures | rg '(^|[\\/])xsd[\\/]wildcards[\\/]'
```

Find whether a SOAP attachment fixture exists:

```bash
rg --files test/conformance/fixtures | rg '(^|[\\/])attachment-'
```

Use `rg` when searching by concept inside paths or XML content:

```bash
rg -n "xs:anyAttribute|wildcard-attribute" test\conformance\fixtures
```

## Agent Retrieval Playbook

Agents should prefer a small number of focused file-system checks before adding or renaming fixtures. These commands are intentionally simple and use portable `rg` patterns.

Check the current taxonomy shape:

```bash
rg --files test/conformance/fixtures | sort
```

Check whether a domain branch already exists:

```bash
rg --files test/conformance/fixtures | rg '(^|[\\/])xsd[\\/]types[\\/]'
```

Find fixtures by filename classifier:

```bash
rg --files test/conformance/fixtures | rg '(^|[\\/])type-'
```

Find fixtures by XML feature content:

```bash
rg -n "xs:union|xs:anyAttribute|substitutionGroup|PolicyReference" test\conformance\fixtures
```

Check whether old filler names are still present:

```bash
rg --files test/conformance/fixtures | rg '(^|[\\/])service\.wsdl'
```

Find the registry row that owns a fixture path:

```bash
rg -n "wildcard-attribute-any|type-union-simple|attachment-mtom-xop" test\conformance\registry.ts
```

Use these commands as discovery checks, not as validation gates. Repository validation still runs through `npm run docs:validate`, `npm run test:conformance`, and `npm test`.

## Candidate Fixture Paths

Use these paths as the target direction for the current conformance corpus:

```text
test/conformance/fixtures/xsd/compositors/choice-union-simple.wsdl
test/conformance/fixtures/xsd/types/type-union-simple.wsdl
test/conformance/fixtures/xsd/types/type-complex-abstract-extension.wsdl
test/conformance/fixtures/xsd/elements/element-substitution-group.wsdl
test/conformance/fixtures/wsdl/bindings/binding-soap-first-multi.wsdl
test/conformance/fixtures/ws-policy/references/policy-reference-external.wsdl
test/conformance/fixtures/xsd/sequences/sequence-composition-deep.wsdl
test/conformance/fixtures/xsd/wildcards/wildcard-attribute-any.wsdl
test/conformance/fixtures/soap/attachments/attachment-mtom-xop.wsdl
```

## References

- [Google AIP-122 Resource Names](https://google.aip.dev/122)
- [Zalando RESTful API Guidelines](https://opensource.zalando.com/restful-api-guidelines/)
- [Microsoft Azure API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)
- [REST API URI Naming Conventions](https://restfulapi.net/resource-naming/)
