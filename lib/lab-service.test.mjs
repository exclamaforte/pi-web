import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  discoverLabs,
  isLabSession,
  isDaemonAlive,
  getActualWorkerModel,
} = await jiti.import("./lab-service.ts");

test("isLabSession recognizes lab session IDs", () => {
  assert.deepEqual(isLabSession("lab-implementer", "/some/path"), {
    isLab: true,
    role: "implementer",
    labPath: "/some/path",
  });
  assert.deepEqual(isLabSession("lab-pi", "/some/path"), {
    isLab: true,
    role: "pi",
    labPath: "/some/path",
  });
  assert.deepEqual(isLabSession("lab-reviewer", "/some/path"), {
    isLab: true,
    role: "reviewer",
    labPath: "/some/path",
  });
  assert.equal(isLabSession("regular-session-id", "/some/path").isLab, false);
});

test("discoverLabs finds lab workspaces", () => {
  const labs = discoverLabs();
  assert.ok(Array.isArray(labs));
  assert.ok(labs.length > 0, "Should discover at least one lab workspace");

  const labPaths = labs.map((l) => l.path);
  assert.ok(
    labPaths.some((p) => p.includes("pi-research-lab") || p.includes("cclm")),
    "Should discover pi-research-lab or cclm",
  );
});

test("isDaemonAlive returns false for non-existent path", () => {
  const res = isDaemonAlive("/tmp/nonexistent-lab-dir-xyz");
  assert.equal(res.alive, false);
});

test("getActualWorkerModel falls back gracefully when session does not exist", () => {
  const model = getActualWorkerModel("/nonexistent/lab", "lab-pi", "fallback-model");
  assert.equal(model, "fallback-model");
});

