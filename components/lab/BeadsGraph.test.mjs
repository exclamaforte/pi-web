import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./BeadsGraph.tsx", import.meta.url), "utf8");

test("loads the graph from the new GET list endpoint", () => {
  assert.match(source, /fetch\(`\/api\/lab\/beads\?path=\$\{encodeURIComponent\(labPath\)\}`\)/);
});

test("renders dependency edges as an SVG with status-colored nodes", () => {
  assert.match(source, /<svg[^>]*aria-label="Beads dependency graph"/);
  assert.match(source, /markerEnd="url\(#bead-edge-arrow\)"/);
  assert.match(source, /colorForStatus\(n\.status\)/);
});

test("clicking a node loads full bead text into the shared sidebar", () => {
  assert.match(source, /onClick=\{\(\) => openBead\(n\.id\)\}/);
  assert.match(source, /action: "show", path: labPath, bdId: id/);
  assert.match(source, /<BeadDetailPanel bead=\{detail\.bead\}/);
});

test("shows a status legend for the audit colors", () => {
  assert.match(source, /status: "open", label: "Open"/);
  assert.match(source, /status: "in_progress", label: "In progress"/);
  assert.match(source, /status: "blocked", label: "Blocked"/);
  assert.match(source, /status: "closed", label: "Closed"/);
  assert.match(source, /status: "deferred", label: "Deferred"/);
});

test("legend includes status filter checkboxes to toggle graph visibility", () => {
  assert.match(source, /type="checkbox"/);
  assert.match(source, /selectedStatuses/);
  assert.match(source, /toggleStatus/);
});

