import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const reviewedLicenses = new Set([
  "(BSD-3-Clause OR GPL-2.0)",
  "(MIT OR Apache-2.0)",
  "(MIT OR CC0-1.0)",
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "MIT AND Apache-2.0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

const report = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
}));

const expressions = Object.keys(report).sort();
const unreviewed = expressions.filter((license) => !reviewedLicenses.has(license));
assert.deepEqual(unreviewed, [], `unreviewed production licenses: ${unreviewed.join(", ")}`);

const packageVersions = Object.values(report).reduce(
  (total, packages) => total + packages.reduce((subtotal, entry) => subtotal + entry.versions.length, 0),
  0,
);
const nodeForge = report["(BSD-3-Clause OR GPL-2.0)"]?.find((entry) => entry.name === "node-forge");
assert.ok(nodeForge, "node-forge dual-license review is missing; select BSD-3-Clause for distribution");

console.log(JSON.stringify({
  ok: true,
  packageVersions,
  licenseExpressions: expressions,
  distributionChoices: { "node-forge": "BSD-3-Clause" },
  fileLevelObligations: report["MPL-2.0"]?.map((entry) => entry.name) ?? [],
}));
