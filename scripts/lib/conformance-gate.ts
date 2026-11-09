function hasFocusedConformanceRun(script: string): boolean {
  return /\bvitest\s+run\b/.test(script) && /\btest[\\/]conformance\b/.test(script);
}

function hasBroadVitestRun(script: string): boolean {
  return /\bvitest\s+run\b/.test(script) && !/\btest[\\/](unit|snapshot|integration|conformance)\b/.test(script);
}

function ciRunsBroadTests(script: string): boolean {
  let referenceCompleted = false;
  for (const command of script.split(/\s*&&\s*/)) {
    if (/^npm\s+run\s+test:reference$/.test(command.trim())) referenceCompleted = true;
    const productCommand = referenceCompleted
      ? command.replace(/(?:^|\s)--exclude\s+(["']?)test[\\/]conformance[\\/]reference[\\/]\*\*\1(?=\s|$)/g, "")
      : command;
    if (/\bnpm\s+test(?:\s|$)/.test(command) || /\bnpm\s+run\s+test(?:\s|$)/.test(command)
      || hasBroadVitestRun(productCommand)) return true;
  }
  return false;
}

/**
 * Checks focused conformance and complete product discovery in the release scripts.
 * @param scripts Package script names and commands.
 * @returns Contract errors, empty when conformance remains release-covered.
 * @why Issue #456 permits excluding the reference subtree only after its independent lane succeeds in the CI chain.
 */
export function verifyConformanceGateScripts(scripts: Record<string, string>): string[] {
  const errors: string[] = [];
  const resolve = (name: string): string => {
    const command = scripts[name] ?? "";
    return command === `tsx scripts/run-verification.ts ${name}:run` ? scripts[`${name}:run`] ?? "" : command;
  };
  const focusedConformance = resolve("test:conformance");
  const allTests = resolve("test");
  const ci = resolve("ci");

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
