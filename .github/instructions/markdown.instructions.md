---
applyTo: "**/*.md"
---

# Markdown Formatting Rules

## The background

Four audiences read Markdown files in this repository:

- Humans
- AI models
- Developer tools (linters, parsers, extractors)
- IDEs, terminals, and other display environments

Each audience parses structure differently. Humans rely on visual cues. The other three rely on Markdown syntax elements.

Common examples of this asymmetry:

- Bold text that looks like a heading to a human is still just emphasized text to every other reader.
- A nested list that looks organized to a human is an ambiguous structure that tools and AI models cannot reliably interpret.
- Nested code blocks can be understood by LLMs but break display for humans and cannot be parsed by tools.
- Emojis and other Unicode characters can be visually distinctive but are invisible noise to tools and AI models, besides potential issues in some display environments.

## The governing principles

### Structural syntax over visual decoration

Use only Markdown elements that carry structural meaning in the syntax itself. If a formatting choice depends on visual appearance to convey its purpose, it will fail for three out of four audiences. When this file does not cover a specific case, apply this principle to decide.

### Meaning lives in words, not in formatting

All meaning must reside in words and sentence structure. If removing a formatting element (bold, dash, nesting, indentation) would change what the text says, that meaning is encoded in a layer that three audiences cannot access. Express relationships through explicit words and punctuation instead: a colon to introduce an explanation, a semicolon to connect related clauses, or a separate sentence when the original phrasing carried a causal or conditional relationship.

When restructuring existing text to follow these rules, preserve all original meaning and detail; changing the format must not change the content.

## Heading Elements

### Rules for document structure and navigation

Headings are the only Markdown element that all four audiences interpret as structure. IDE outlines, document navigation, breadcrumbs, and AI section-boundary detection all depend on heading syntax. Bold text, regardless of how prominent it looks, does not appear in any of these.

- Use `#` (ATX) syntax only, not underline-style (Setext).
- Use exactly one h1 per file as the document title.
- Do not skip levels. An h4 must appear under an h3, not directly under an h2.
- Use h1 through h6 as needed. Do not artificially stop at h3.
- Never use bold text as a substitute for a heading.
- When you need finer structure than your current deepest heading, use the next heading level.

## List Blocks

### Rules for list formatting and item scope

A list item must express exactly one idea in one line (be "atomic" / indivisible semantically). When an item contains a sub-list, a bold label followed by content, or multiple sentences, tools and AI models cannot reliably determine where one item's meaning ends and the next begins.

- Do not nest lists. Promote the nested structure to a section with its own heading.
- Do not use the bold-label pattern (`- **Label:** content`). Convert it to a heading with prose underneath.
- Keep items under approximately 120 characters.
- Use `-` for unordered lists, numbers for ordered.

## Inline Markup

### Rules for bold, italic, and other inline formatting

Bold and italic do not function as importance signals outside of human visual scanning. AI models do not treat bold text as higher priority, and developer tools ignore emphasis entirely when analyzing document structure.

- Do not use bold or italic to signal importance or priority.
- Use backticks for code references, file paths, and commands.
- Communicate importance through position and word choice (`must`, `never`, `always`).
- If content must stand out, give it its own heading.

## Dashes

### Rules for punctuation style

Em dashes are a recognizable AI writing pattern that reduces the perceived quality and authenticity of the text. Prefer sentence-level punctuation that carries structure.

- Do not use em dashes as punctuation.
- Do not use double hyphens as punctuation.
- Use a period to split into two sentences.
- Use a semicolon for closely related clauses.
- Use a colon to introduce an explanation.

## Structural Separators

### Rules for section boundaries

Multiple Markdown parsers interpret `---` as a YAML frontmatter delimiter. It can silently truncate content, produce parsing errors, or break document-splitting tools when used in the body of a document.

YAML frontmatter is allowed when it is intended. It must appear only at the very start of the file.

- Allow YAML frontmatter blocks only at the start of a file. Use the pattern `---` on the first line, YAML key-value pairs, then `---` to close.
- Never use horizontal rules (`---`, `***`, `___`) in the body of a Markdown document.
- Use headings to create section boundaries.

## Code Blocks

### Rules for code examples

Code examples should be unambiguous to parsers and easy to copy. Keep them minimal and focused on the reader's next action.

- Always specify a language identifier on fenced code blocks.
- Keep examples minimal. Use the shortest code that demonstrates the point.
- Show commands the reader should run, not terminal session transcripts.

## Tables

### Rules for tabular data

Tables work reliably across all four audiences when kept simple. Parsers struggle with complex content in cells.

- Always include a header row.
- Keep cell content to short phrases.
- Do not place headings, lists, or code blocks inside cells.
- Promote complex cell content to its own section.
- Do not use bold or italic text as a marker for table headers. Use the header row for this purpose.

## Prose Paragraphs

### Rules for body text

Short paragraphs are easier to skim and easier for tools and AI models to segment. Put the most important information first.

- Write one to three sentences per paragraph.
- Express one idea per paragraph.
- Place the most important information in the first sentence.
- When a paragraph grows beyond three-four sentences or contains separate ideas, split it or promote the content to its own headed section.

## References

- Skill code-style-markdown: check if the SKILL.md file is present in the repository (`.github/skills/code-style-markdown` or similar locations).
- Markdown syntax documentation: https://www.markdownguide.org/basic-syntax/ for reference on how different Markdown elements are rendered and parsed.