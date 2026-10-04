import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./BeadDetailPanel.tsx", import.meta.url), "utf8");

test("shared sidebar renders the aside with full bead text sections", () => {
  assert.match(source, /aria-label="Bead detail"/);
  assert.match(source, /\{bead\.description &&/);
  assert.match(source, /\{bead\.design &&/);
  assert.match(source, /\{bead\.acceptance_criteria &&/);
});

test("sidebar shows status, type, priority, and label chips", () => {
  assert.match(source, /\{bead\.status\}/);
  assert.match(source, /\{bead\.issue_type &&/);
  assert.match(source, /P\{bead\.priority\}/);
  assert.match(source, /\{\(bead\.labels \|\| \[\]\)\.map/);
});

test("both audit views reuse this panel", async () => {
  const graph = await readFile(new URL("./BeadsGraph.tsx", import.meta.url), "utf8");
  const timeline = await readFile(new URL("./BeadsTimeline.tsx", import.meta.url), "utf8");
  assert.match(graph, /<BeadDetailPanel bead=\{detail\.bead\}/);
  assert.match(timeline, /<BeadDetailPanel bead=\{detail\.bead\}/);
});
