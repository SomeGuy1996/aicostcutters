// ============================================================================
// AICostCutters — Full Test Suite Runner
// Run: node test/run-all.cjs
// ============================================================================

const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const TEST_DIR = __dirname;
const tests = ["unit.test.cjs", "integration.test.cjs", "e2e.test.cjs"];

let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;

console.log("=".repeat(56));
console.log("  AICostCutters — Full Test Suite");
console.log("=".repeat(56));

for (const test of tests) {
  const testPath = path.join(TEST_DIR, test);
  if (!fs.existsSync(testPath)) {
    console.log(`\n  ⏭️  ${test} — file not found, skipping`);
    totalSkip++;
    continue;
  }

  console.log(`\n📋 ${test}`);
  try {
    const start = Date.now();
    execSync(`node --test ${testPath}`, {
      cwd: path.join(TEST_DIR, ".."),
      stdio: "inherit",
      timeout: 120000,
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ✅ ${test} passed (${elapsed}s)`);
    totalPass++;
  } catch (e) {
    console.log(`  ❌ ${test} FAILED`);
    totalFail++;
  }
}

console.log(`\n${"=".repeat(56)}`);
console.log(`  Results: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped`);
if (totalFail === 0) {
  console.log("  🎉 All tests passing!");
} else {
  console.log(`  ⚠️  ${totalFail} test suite(s) failed`);
}
console.log("=".repeat(56));

process.exit(totalFail > 0 ? 1 : 0);
