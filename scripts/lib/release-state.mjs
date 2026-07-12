#!/usr/bin/env node

/** Release candidate abandonment state and publication guard logic.
 * @since 1.0.0
 * @constraints Release and abandonment tags are immutable final-form evidence.
 */

import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+$/;

/** Parse a final-form release tag and derive its abandonment marker.
 * @param {string} tag Final-form `vX.Y.Z` release tag.
 * @returns {{tag: string, version: string, marker: string}} Parsed release identity.
 * @throws {Error} When the tag is not final-form semantic version syntax.
 */
export function parseReleaseTag(tag) {
  if (!RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error(`Release tag '${tag}' must match vX.Y.Z.`);
  }

  return {
    tag,
    version: tag.slice(1),
    marker: `abandoned/${tag}`,
  };
}

/** Classify marker state against the peeled release commit.
 * @param {{releaseCommit: string, markerCommit?: string}} input Peeled commit identities.
 * @returns {"absent"|"matching"} Marker state when the repository state is valid.
 * @throws {Error} When the marker points at a different commit.
 */
export function classifyAbandonmentMarker({releaseCommit, markerCommit}) {
  if (!markerCommit) {
    return "absent";
  }
  if (markerCommit !== releaseCommit) {
    throw new Error(`Abandonment marker resolves to ${markerCommit}, but the release tag resolves to ${releaseCommit}. Maintainer review is required.`);
  }
  return "matching";
}

/** Validate GitHub Release state before package-capable jobs may run.
 * @param {{draft: boolean, prerelease: boolean, published: boolean}} input Normalized GitHub Release state.
 * @returns {void}
 * @throws {Error} When the release is not a normal published release.
 */
export function verifyPublicationState({draft, prerelease, published}) {
  if (!published || draft || prerelease) {
    throw new Error("Package publication requires an existing published, non-draft, non-prerelease GitHub Release.");
  }
}

function git(args) {
  return execFileSync("git", args, {encoding: "utf8"}).trim();
}

function optionalRefCommit(ref) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

function isReachableFromMain(commit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "origin/main"], {stdio: "pipe"});
    return true;
  } catch {
    return false;
  }
}

function booleanArg(value, name) {
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be true or false.`);
  }
  return value === "true";
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near '${key ?? ""}'.`);
    }
    values.set(key.slice(2), value);
  }
  return {command, values};
}

function writeGithubOutput(filePath, values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(path.resolve(filePath), `${lines.join("\n")}\n`, "utf8");
}

function inspectTag(tag) {
  const identity = parseReleaseTag(tag);
  const releaseCommit = git(["rev-parse", "--verify", `${identity.tag}^{commit}`]);
  const markerCommit = optionalRefCommit(identity.marker);
  const markerState = classifyAbandonmentMarker({releaseCommit, markerCommit});

  return {...identity, releaseCommit, markerCommit, markerState};
}

function main() {
  const {command, values} = parseArgs(process.argv.slice(2));
  if (command !== "inspect" && command !== "guard") {
    throw new Error("Usage: release-state.mjs <inspect|guard> --tag vX.Y.Z [options]");
  }

  const tag = values.get("tag");
  if (!tag) {
    throw new Error("--tag is required.");
  }

  const state = inspectTag(tag);
  if (values.get("require-main") === "true" && !isReachableFromMain(state.releaseCommit)) {
    throw new Error(`Release tag ${state.tag} is not reachable from origin/main.`);
  }

  if (command === "guard" && state.markerState === "matching") {
    throw new Error(`Release ${state.tag} is permanently abandoned by ${state.marker}. Publication is prohibited.`);
  }

  if (command === "guard" && values.get("mode") === "package") {
    verifyPublicationState({
      draft: booleanArg(values.get("draft"), "--draft"),
      prerelease: booleanArg(values.get("prerelease"), "--prerelease"),
      published: booleanArg(values.get("published"), "--published"),
    });
  }

  const output = {
    tag: state.tag,
    version: state.version,
    marker: state.marker,
    release_commit: state.releaseCommit,
    marker_commit: state.markerCommit ?? "",
    marker_state: state.markerState,
  };
  const githubOutput = values.get("github-output");
  if (githubOutput) {
    writeGithubOutput(githubOutput, output);
  }
  console.log(JSON.stringify(output));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
