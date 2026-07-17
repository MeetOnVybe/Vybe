import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.PLAYWRIGHT_CHROMIUM_PATH && existsSync("/usr/bin/chromium")) {
  env.PLAYWRIGHT_CHROMIUM_PATH = "/usr/bin/chromium";
}

const suites = [
  { label: "Phase 5 live video", args: ["tests/phase5.spec.ts"] },
  { label: "Phase 4 regression", args: ["tests/phase4.spec.ts"] },
  { label: "Phase 3 regression", args: ["tests/phase3.spec.ts"] },
  { label: "Phase 2 social flow", args: ["tests/vybe-flow.spec.ts", "-g", "Phase 2 preserves"] },
  { label: "Profile and settings persistence", args: ["tests/vybe-flow.spec.ts", "-g", "profile customization"] },
  { label: "Route and hydration sweep", args: ["tests/vybe-flow.spec.ts", "-g", "all application pages"] },
  { label: "Legacy 390px mobile regression", args: ["tests/vybe-flow.spec.ts", "-g", "390px mobile match"] },
];

const executable = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);

for (const [index, suite] of suites.entries()) {
  console.log(`\n=== ${suite.label} ===`);
  const result = spawnSync(
    executable,
    ["test", ...suite.args, "--workers=1"],
    { env: { ...env, PLAYWRIGHT_PORT: String(3110 + index) }, stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
