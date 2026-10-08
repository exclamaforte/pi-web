import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getWorkerTimeline } = await jiti.import("./lab-service.ts");

function writeTimeline(dir, lines) {
  const labDir = path.join(dir, ".lab");
  fs.mkdirSync(labDir, { recursive: true });
  fs.writeFileSync(path.join(labDir, "worker-timeline.jsonl"), lines.join("\n") + "\n");
}

test("getWorkerTimeline returns [] when no file exists", () => {
  assert.deepEqual(getWorkerTimeline("/tmp/nonexistent-lab-dir-xyz"), []);
});

test("getWorkerTimeline parses samples and skips malformed lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-timeline-"));
  writeTimeline(dir, [
    JSON.stringify({ ts: 1000, workers: { pi: { alive: true, connected: true, busy: false, held: false, parked: true, parked_on: ["job abc"], pending: 0, restarts: 0 } } }),
    "not json at all",
    JSON.stringify({ nope: "missing ts and workers" }),
    JSON.stringify({ ts: 1020, workers: { pi: { alive: true, connected: true, busy: true, held: false, parked: false, pending: 2 } } }),
  ]);
  const out = getWorkerTimeline(dir);
  assert.equal(out.length, 2);
  assert.equal(out[0].ts, 1000);
  assert.equal(out[0].workers.pi.parked, true);
  assert.deepEqual(out[0].workers.pi.parkedOn, ["job abc"]);
  assert.equal(out[1].workers.pi.busy, true);
  assert.equal(out[1].workers.pi.pending, 2);
  assert.deepEqual(out[1].workers.pi.parkedOn, []);
});

test("getWorkerTimeline respects the limit", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-timeline-"));
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push(JSON.stringify({ ts: i, workers: {} }));
  }
  writeTimeline(dir, lines);
  const out = getWorkerTimeline(dir, 3);
  assert.equal(out.length, 3);
  assert.equal(out[0].ts, 7);
});
