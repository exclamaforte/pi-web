import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: {
    "@/": rootDir,
  },
});

const { discoverLabs, getFullLabStatus, getGpuQueueStatus, isLabSession } =
  await jiti.import("./lab-service.ts");

test("discoverLabs discovers lab workspaces", () => {
  const labs = discoverLabs();
  assert.ok(Array.isArray(labs));
  assert.ok(labs.length > 0);
  assert.ok(labs.some((l) => l.path.includes("cclm") || l.path.includes("pi-research-lab")));
});

test("getFullLabStatus retrieves status for pi-research-lab", async () => {
  const status = await getFullLabStatus("/home/gabe/pi-research-lab");
  assert.ok(status);
  assert.equal(status.lab.id, "pi-research-lab");
  assert.ok("daemon" in status);
  assert.ok("workers" in status);
  assert.ok("beads" in status);
  assert.ok("gpuQueue" in status);
  assert.ok(Array.isArray(status.daemonLogs));
});

test("getFullLabStatus retrieves status for active cclm lab", async () => {
  const status = await getFullLabStatus("/home/gabe/Documents/cclm");
  assert.ok(status);
  assert.equal(status.lab.id, "cclm");
  assert.equal(status.daemon.alive, true);
  assert.ok(status.workers.implementer);
  assert.equal(status.workers.implementer.alive, true);
});

test("getGpuQueueStatus reports live GPU queue", async () => {
  const status = await getGpuQueueStatus();
  assert.ok(status.available);
  assert.ok(Array.isArray(status.running));
  assert.ok(Array.isArray(status.queued));
  assert.ok(Array.isArray(status.recent));
});
