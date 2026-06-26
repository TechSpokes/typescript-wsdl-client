export function findDatedChangelogSection(lines, version) {
  const prefix = `## [${version}] - `;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (!line.startsWith(prefix)) continue;
    return { index, dateString: line.slice(prefix.length).trim() };
  }
  return null;
}

const SUPPORTED_NODE_FLOOR = 24;
const CURRENT_NODE_LINE = 26;

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

export function verifyPublishWorkflowGate(scripts, releasePackageWorkflow) {
  const errors = [];
  const publishCheck = scripts["release:publish-check"] ?? "";

  if (!publishCheck) {
    errors.push("package.json scripts.release:publish-check must exist for targeted post-release publish validation.");
  }
  for (const required of ["build", "typecheck", "skill:validate", "package:validate"]) {
    if (!new RegExp(`\\bnpm\\s+run\\s+${required.replace(":", "\\:")}\\b`).test(publishCheck)) {
      errors.push(`package.json scripts.release:publish-check must run npm run ${required}.`);
    }
  }
  if (/\bnpm\s+run\s+ci\b|\bnpm\s+test\b|\bvitest\s+run\b|\bsmoke:pipeline\b|\btest:conformance\b/.test(publishCheck)) {
    errors.push("package.json scripts.release:publish-check must stay targeted and must not run full tests, conformance, smoke, or npm run ci.");
  }
  if (!/\bnpm\s+run\s+release:publish-check\b/.test(releasePackageWorkflow)) {
    errors.push("Release package workflow must run npm run release:publish-check before publishing.");
  }
  if (/\bnpm\s+run\s+ci\b/.test(releasePackageWorkflow)) {
    errors.push("Release package workflow must not run npm run ci; full CI belongs to release preflight before tagging.");
  }

  return errors;
}

function hasNodeLine(workflow, line) {
  return new RegExp(`(^|[^0-9])${line}([^0-9]|$)`).test(workflow);
}

function hasEngineFloor(packageJson, line) {
  return packageJson.engines?.node === `>=${line}.0.0`;
}

export function verifyNodeReleaseGate({
  packageJson,
  ciWorkflow,
  releasePackageWorkflow,
  releaseDraftWorkflow,
}) {
  const errors = [];

  if (!hasEngineFloor(packageJson, SUPPORTED_NODE_FLOOR)) {
    errors.push(`package.json engines.node must declare Node >=${SUPPORTED_NODE_FLOOR}.0.0.`);
  }
  if (!hasNodeLine(ciWorkflow, SUPPORTED_NODE_FLOOR)) {
    errors.push(`CI workflow must test the supported Node floor ${SUPPORTED_NODE_FLOOR}.`);
  }
  if (!hasNodeLine(ciWorkflow, CURRENT_NODE_LINE)) {
    errors.push(`CI workflow must test the current Node line ${CURRENT_NODE_LINE}.`);
  }
  if (!hasNodeLine(releasePackageWorkflow, SUPPORTED_NODE_FLOOR)) {
    errors.push(`Release package workflow must run on Node ${SUPPORTED_NODE_FLOOR}.`);
  }
  if (!hasNodeLine(releaseDraftWorkflow, SUPPORTED_NODE_FLOOR)) {
    errors.push(`Draft release workflow must run on Node ${SUPPORTED_NODE_FLOOR}.`);
  }

  return errors;
}
