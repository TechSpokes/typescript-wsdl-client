export function findDatedChangelogSection(lines, version) {
  const prefix = `## [${version}] - `;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (!line.startsWith(prefix)) continue;
    return { index, dateString: line.slice(prefix.length).trim() };
  }
  return null;
}

function hasFocusedConformanceRun(script) {
  return /\bvitest\s+run\b/.test(script) && /\btest[\\/]conformance\b/.test(script);
}

function hasBroadVitestRun(script) {
  return /\bvitest\s+run\b/.test(script) && !/\btest[\\/](unit|snapshot|integration|conformance)\b/.test(script);
}

function ciRunsBroadTests(script) {
  return /\bnpm\s+test(?:\s|$)/.test(script) || /\bnpm\s+run\s+test(?:\s|$)/.test(script) || hasBroadVitestRun(script);
}

export function verifyConformanceGateScripts(scripts) {
  const errors = [];
  const focusedConformance = scripts["test:conformance"] ?? "";
  const allTests = scripts.test ?? "";
  const ci = scripts.ci ?? "";

  if (!hasFocusedConformanceRun(focusedConformance)) {
    errors.push("package.json scripts.test:conformance must run vitest against test/conformance.");
  }
  if (!hasBroadVitestRun(allTests)) {
    errors.push("package.json scripts.test must leave Vitest discovery broad enough to include test/conformance.");
  }
  if (!ciRunsBroadTests(ci)) {
    errors.push("package.json scripts.ci must run npm test, npm run test, or a broad vitest run so conformance is release-covered.");
  }

  return errors;
}
