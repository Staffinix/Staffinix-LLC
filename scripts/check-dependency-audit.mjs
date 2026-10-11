import { spawnSync } from "node:child_process";

const minimumSeverity = "moderate";
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

// No patched sprintf-js release exists as of 2026-10-11. Mammoth reaches it through its
// CLI-only argparse dependency, while Staffinix uses Mammoth's extractRawText API inside the
// isolated, size-limited document worker. Keep this exception narrow so every new advisory still
// fails the release gate.
const allowedAdvisories = new Set(["https://github.com/advisories/GHSA-hp3w-g68c-fv3c"]);

const npmCli = process.env.npm_execpath;
const result = npmCli
  ? spawnSync(process.execPath, [npmCli, "audit", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
  : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
    });

if (result.error) throw result.error;

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout);
  throw new Error("npm audit did not return valid JSON.");
}

const vulnerabilities = report.vulnerabilities ?? {};

function advisoryUrlsFor(name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);

  const urls = new Set();
  for (const via of vulnerabilities[name]?.via ?? []) {
    if (typeof via === "string") {
      for (const url of advisoryUrlsFor(via, seen)) urls.add(url);
    } else if (via?.url) {
      urls.add(via.url);
    }
  }
  return urls;
}

const failures = [];
const accepted = [];
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if ((severityRank[vulnerability.severity] ?? 99) < severityRank[minimumSeverity]) continue;

  const urls = advisoryUrlsFor(name);
  const isNarrowlyAllowed = urls.size > 0 && [...urls].every((url) => allowedAdvisories.has(url));

  if (isNarrowlyAllowed) accepted.push(`${name} (${vulnerability.severity})`);
  else failures.push({ name, severity: vulnerability.severity, urls: [...urls] });
}

if (accepted.length > 0) {
  console.warn(`Accepted documented unpatched advisory chain: ${accepted.join(", ")}`);
}

if (failures.length > 0) {
  console.error("New dependency vulnerabilities require review:");
  for (const failure of failures) {
    console.error(
      `- ${failure.name} (${failure.severity})${
        failure.urls.length ? `: ${failure.urls.join(", ")}` : ""
      }`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(`Dependency audit passed at ${minimumSeverity} severity.`);
}
