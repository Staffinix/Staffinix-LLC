import { spawnSync } from "node:child_process";

const minimumSeverity = "moderate";
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

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
if (report.error || !report.metadata?.vulnerabilities) {
  throw new Error("Dependency audit did not complete successfully.");
}

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
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if ((severityRank[vulnerability.severity] ?? 99) < severityRank[minimumSeverity]) continue;

  const urls = advisoryUrlsFor(name);
  failures.push({ name, severity: vulnerability.severity, urls: [...urls] });
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
