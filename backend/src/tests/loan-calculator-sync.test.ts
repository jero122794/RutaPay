// backend/src/tests/loan-calculator-sync.test.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

// The loan calculator is intentionally duplicated because backend (Railway) and
// frontend (Vercel) are deployed as independent packages and cannot share a module
// at build time. The backend copy is the source of truth (it decides real money);
// the frontend copy must mirror it exactly so the live preview never diverges from
// what the server persists. This guard fails CI whenever the two drift apart.

const here = dirname(fileURLToPath(import.meta.url));
const backendCalculatorPath = resolve(here, "../shared/loan-calculator.ts");
const frontendCalculatorPath = resolve(here, "../../../frontend/lib/loan-calculator.ts");

/** Drop the leading `// path/to/file` banner comment so only the logic is compared. */
const stripPathBanner = (source: string): string => {
  const normalized = source.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.startsWith("//")) {
    lines.shift();
  }
  return lines.join("\n").trim();
};

test("backend and frontend loan calculators are byte-identical (ignoring path banner)", () => {
  const backendSource = stripPathBanner(readFileSync(backendCalculatorPath, "utf8"));
  const frontendSource = stripPathBanner(readFileSync(frontendCalculatorPath, "utf8"));

  assert.strictEqual(
    frontendSource,
    backendSource,
    "frontend/lib/loan-calculator.ts diverged from backend/src/shared/loan-calculator.ts. " +
      "The backend copy is the source of truth: copy its body into the frontend file."
  );
});
