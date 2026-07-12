export function findDatedChangelogSection(lines, version) {
  const prefix = `## [${version}] - `;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (!line.startsWith(prefix)) continue;
    return { index, dateString: line.slice(prefix.length).trim() };
  }
  return null;
}

export function verifyTrackedTreeStable(before, after) {
  return before === after
    ? []
    : ["Release preflight modified tracked content; review the diff and rerun preflight on the new final candidate."];
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
  if (/publish-gpr:|npm\.pkg\.github\.com|packages:\s*write/.test(releasePackageWorkflow)) {
    errors.push("Release package workflow must publish only to npmjs and must not grant GitHub Packages capability.");
  }
  if (!/NPM_VERSION:\s*[0-9]+\.[0-9]+\.[0-9]+/.test(releasePackageWorkflow)
    || !/npm\s+install\s+-g\s+npm@\$\{NPM_VERSION}/.test(releasePackageWorkflow)
    || /npm@latest/.test(releasePackageWorkflow)) {
    errors.push("Release package workflow must pin and install an exact tested npm version.");
  }

  return errors;
}

/** Verify workflow ordering and privilege boundaries for abandoned candidates.
 * @param {{releaseDraftWorkflow: string, releasePackageWorkflow: string, releaseAbandonWorkflow: string}} workflows Workflow sources.
 * @returns {string[]} Contract errors; empty when release-state enforcement is wired correctly.
 */
export function verifyReleaseAbandonmentGate({
  releaseDraftWorkflow,
  releasePackageWorkflow,
  releaseAbandonWorkflow,
}) {
  const errors = [];
  const helper = "scripts/lib/release-state.mjs";
  const draftGuard = releaseDraftWorkflow.indexOf(helper);
  const draftPackaging = releaseDraftWorkflow.indexOf("Package agent skill");
  if (draftGuard === -1 || draftPackaging === -1 || draftGuard > draftPackaging) {
    errors.push("Draft release workflow must guard abandonment state before packaging or draft mutation.");
  }

  const packageGuard = releasePackageWorkflow.indexOf(helper);
  const publishCheck = releasePackageWorkflow.indexOf("npm run release:publish-check");
  if (packageGuard === -1 || publishCheck === -1 || packageGuard > publishCheck) {
    errors.push("Release package workflow must guard abandonment state before publish validation.");
  }
  if (!/publish-npm:\s+[\s\S]*?needs:\s*build/.test(releasePackageWorkflow)) {
    errors.push("The npmjs publication job must depend on the guarded build job.");
  }

  const buildStart = releasePackageWorkflow.indexOf("\n  build:");
  const publishStart = releasePackageWorkflow.indexOf("\n  publish-npm:");
  const buildBlock = buildStart === -1 || publishStart === -1
    ? ""
    : releasePackageWorkflow.slice(buildStart, publishStart);
  if (/packages:\s*write|id-token:\s*write/.test(buildBlock)) {
    errors.push("The guarded build job must not receive package or OIDC publication capability.");
  }

  const markerCreation = releaseAbandonWorkflow.indexOf("git tag -a");
  const markerVerification = releaseAbandonWorkflow.indexOf("Verify immutable abandonment marker");
  const draftRetirement = releaseAbandonWorkflow.indexOf("gh release delete");
  if (!releaseAbandonWorkflow.includes("workflow_dispatch:")
    || markerCreation === -1
    || markerVerification === -1
    || draftRetirement === -1
    || markerCreation > markerVerification
    || markerVerification > draftRetirement) {
    errors.push("Manual abandonment workflow must create and verify the immutable marker before retiring the draft release.");
  }
  if (/gh\s+release\s+delete[^\n]*--cleanup-tag/.test(releaseAbandonWorkflow)) {
    errors.push("Manual abandonment workflow must never delete the release tag while retiring a draft.");
  }
  if (!releaseAbandonWorkflow.includes("MARKER_STATE")
    || !releaseAbandonWorkflow.includes("present=false")) {
    errors.push("Manual abandonment workflow must accept a matching marker with an already absent draft.");
  }
  if (!releaseAbandonWorkflow.includes("Actor: ${ACTOR}")
    || !releaseAbandonWorkflow.includes("Evidence: ${EVIDENCE}")) {
    errors.push("Manual abandonment workflow must preserve actor and optional evidence in new marker annotations.");
  }

  for (const workflow of [releaseDraftWorkflow, releasePackageWorkflow, releaseAbandonWorkflow]) {
    if (!workflow.includes("group: release-state-")) {
      errors.push("Release workflows must serialize candidate state transitions through a per-tag concurrency group.");
      break;
    }
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
  releaseAbandonWorkflow,
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
  if (!hasNodeLine(releaseAbandonWorkflow, SUPPORTED_NODE_FLOOR)) {
    errors.push(`Release abandonment workflow must run on Node ${SUPPORTED_NODE_FLOOR}.`);
  }

  return errors;
}
