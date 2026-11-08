# ADR 004: Product Delivery and Research Boundaries

Separate exploratory work from product validation while retaining the correctness contracts in [ADR-003](003-content-model-contracts.md). See the root [README](../../README.md) for the documentation index.

## Status and context

Adopted for the maintainer-requested product/research separation. ADR-003's checked-product amendment already permits independently supported product slices before universal research completion; the automation and roadmap must reflect that decision.

The generator, runtime and existing native semantic implementation are product code, including modules with research-derived names. Their size or origin does not make them removable research.

## Package boundary

The npm payload contains executable code, declarations, generation resources, consumer guides and runnable documentation examples. Contributor architecture, research records and historical release archives remain available through repository links.

Package validation checks actual pack contents, mandatory resources and consumer navigation, and reports compressed and unpacked bytes by category. Review growth against the change's consumer value instead of imposing an unmeasured byte ceiling; declaration maps and runtime dependencies remain unchanged by this separation.

## Validation boundary

Product validation protects shipped behavior, compatibility, source and endpoint policy, invalid-input refusals and independently expected XML/HTTP exchanges. Retain shared fixtures and reference infrastructure when product tests consume them, regardless of filenames or historical research terminology.

Exploratory implementations and their dedicated consumers live under `research/`, outside product test discovery, required CI and release gates. Research can import product code and shared test infrastructure; product implementations, tests and automation must not import research implementations or audit research provenance.

The product reference launcher retains its executed-method audit and baseline report. Local CI runs that lane once, excluding its files only from the subsequent broad Vitest invocation; plain `npm test` still collects all product tests. Separate product and research migration maps preserve all 53 historical methods without changing archived observations into current proof.

Installed product and existing platform controls remain PR checks on Linux and Windows, with Node 24 and 26. Research validation is optional and available on research changes or manual dispatch; historical environment qualification remains separately dispatchable.

## Product support and research status

Legacy and checked generation retain distinct support boundaries. Checked generation must refuse unsupported or unresolved duties without silent downgrade, discarded constraints or a claim of universal XSD correctness.

Use the existing conformance and readiness corpus to connect representative source inputs, supported modes and executable evidence. Intentional refusals are reported separately from successful generation; corpus examples do not establish general standards coverage or replace security, compatibility and migration requirements.

Research issues remain valid unresolved work unless their individual scope is actually completed. Neither a blanket closure rule nor universal research completion defines product readiness; a specific product change must still establish every native duty it consumes.

## Consequences and review triggers

Product changes can ship without running unrelated experiments, while research remains runnable against the same source tree. Research may drift when product internals change; its optional checks expose that drift without making unrelated delivery conditional on new research results.

Keep current consumer contracts in `docs/`, and exploratory and historical handoff material in `research/docs/`. Record delivery evidence in tests and PR descriptions rather than adding dated checkpoint inventories to consumer documentation.

Revisit this boundary when a research result becomes a product dependency, package growth has no clear consumer benefit, or a public support/default change requires broader qualification. Default activation and a major release retain their existing separate approval, compatibility and migration gates.
