import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./LabSessionBanner.tsx", import.meta.url), "utf8");

test("scopes the worker status lookup by cwd for shared session ids", () => {
  assert.match(
    source,
    /const url = cwd\s*\n?\s*\? `\/api\/agent\/\$\{encodeURIComponent\(sessionId\)\}\?cwd=\$\{encodeURIComponent\(cwd\)\}`/,
  );
});

test("drops the live banner instead of freezing on a stale Idle/Busy badge", () => {
  assert.match(source, /if \(!res\.ok\) return;/);
  assert.match(source, /if \(!\(json\.running && json\.labWorker && json\.state\)\)/);
  assert.match(source, /setWorkerStatus\(null\);/);
});

test("keeps a read-only banner for dead-daemon workers with inbox access", () => {
  assert.match(source, /json\.labWorker && json\.readOnly/);
  assert.match(source, /setDeadLab\(\{ role: json\.role, labPath: json\.labPath \}\)/);
  assert.match(source, /labd down — read-only/);
  // No steer target without a daemon; inbox (the lab's own mechanism) stays.
  assert.match(source, /\{steerModalOpen && workerStatus && \(/);
});

test("renders parked status when worker is waiting for a background job", () => {
  assert.match(source, /workerStatus\.parked/);
  assert.match(source, /"rgba\(168, 85, 247, 0\.15\)"/);
  assert.match(source, /"Parked \(waiting for job\)"/);
});

