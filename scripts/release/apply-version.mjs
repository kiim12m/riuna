#!/usr/bin/env node
// Stamps a version into the uncommitted tree before build-images.yml builds
// images, so they self-report the right version. Add new version-carrying
// files here rather than in a workflow step.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2] ?? "";

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(
    `apply-version: expected a semver version, received ${JSON.stringify(version)}`,
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function rewrite(relativePath, transform, expected) {
  const path = join(root, relativePath);
  const next = transform(readFileSync(path, "utf8"));

  for (const line of expected) {
    if (!next.includes(line)) {
      console.error(
        `apply-version: ${relativePath} has no ${JSON.stringify(line)} after rewriting; update this script`,
      );
      process.exit(1);
    }
  }

  writeFileSync(path, next);
  console.log(`apply-version: ${relativePath} -> ${version}`);
}

rewrite(
  "package.json",
  (source) => source.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`),
  [`"version": "${version}"`],
);

rewrite(
  "charts/riuna/Chart.yaml",
  (source) =>
    source
      .replace(/^version:.*$/m, `version: ${version}`)
      .replace(/^appVersion:.*$/m, `appVersion: "${version}"`),
  [`version: ${version}`, `appVersion: "${version}"`],
);
