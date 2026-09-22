import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Validate trusted insertion data without shipping the compiler in generator code. */
export function validatePreamble(content, name = "preamble") {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const fail = message => { throw new Error(`${name}: ${message}`); };
  if (!text.trim()) fail("empty preamble");
  if (/@ts-(?:check|nocheck|ignore|expect-error)\b|@jsx\w*\b|\/\/\/\s*</i.test(text)) {
    fail("compiler-control directives are forbidden");
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text,
    diagnostic => fail(`lexical error: ${diagnostic.message}`));
  const allowed = new Set([
    ts.SyntaxKind.WhitespaceTrivia, ts.SyntaxKind.NewLineTrivia,
    ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia,
  ]);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (!allowed.has(token)) fail("only comments and whitespace are allowed");
  }
  const sentinel = "const __preambleSentinel: number = 142;";
  const source = ts.createSourceFile("preamble.ts", `${text}\n\n${sentinel}`, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length || source.statements.length !== 1 || source.statements[0].getText(source) !== sentinel) {
    fail("preamble changes the following statement");
  }
}

/** Validate every resource, including future scoped overrides, before packaging. */
export function validatePreambleDirectory(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith(".preamble")) {
        validatePreamble(fs.readFileSync(file, "utf8"), file);
        files.push(file);
      }
    }
  }
  visit(root);
  for (const required of ["typescript.preamble", "app/typescript.preamble", "test/typescript.preamble"]) {
    if (!files.includes(path.join(root, required))) throw new Error(`Missing required preamble: ${required}`);
  }
  return files;
}
