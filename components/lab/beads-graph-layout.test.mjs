import assert from "node:assert/strict";
import test from "node:test";
import {
  NODE_W,
  PAD,
  X_STEP,
  colorForStatus,
  layoutBeadGraph,
  getEdgeHighlight,
  isNodeRelatedToSelection,
} from "./beads-graph-layout.ts";

const bead = (id, deps = [], extra = {}) => ({
  id,
  title: `title ${id}`,
  status: "open",
  deps,
  ...extra,
});

test("places prerequisites in earlier layers with left-to-right edges", () => {
  const layout = layoutBeadGraph([
    bead("a"),
    bead("b", ["a"]),
    bead("c", ["b"]),
  ]);
  const x = new Map(layout.nodes.map((n) => [n.id, n.x]));
  assert.equal(x.get("a"), PAD);
  assert.equal(x.get("b"), PAD + X_STEP);
  assert.equal(x.get("c"), PAD + 2 * X_STEP);
  assert.equal(layout.edges.length, 2);
  for (const e of layout.edges) {
    const from = layout.nodes.find((n) => n.id === e.fromId);
    const to = layout.nodes.find((n) => n.id === e.toId);
    assert.equal(e.x1, from.x + NODE_W);
    assert.equal(e.x2, to.x);
    assert.ok(e.x2 > e.x1, "edge flows left to right");
  }
  const edge = layout.edges.find((e) => e.toId === "c");
  assert.equal(edge.fromId, "b");
});

test("drops edges whose prerequisite is outside the snapshot", () => {
  const layout = layoutBeadGraph([bead("a", ["ghost"])]);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.nodes[0].x, PAD);
});

test("survives a dependency cycle without hanging", () => {
  const layout = layoutBeadGraph([bead("a", ["b"]), bead("b", ["a"])]);
  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.edges.length, 2);
});

test("colors statuses and falls back for unknown ones", () => {
  assert.equal(colorForStatus("open").stroke, "#10b981");
  assert.equal(colorForStatus("in_progress").stroke, "#3b82f6");
  assert.equal(colorForStatus("blocked").stroke, "#ef4444");
  assert.equal(colorForStatus("closed").stroke, "#6b7280");
  assert.equal(colorForStatus("deferred").stroke, "#a855f7");
  assert.equal(colorForStatus("parked").stroke, "#a855f7");
  assert.equal(colorForStatus("something-new").stroke, "#8b5cf6");
});

test("empty input yields an empty canvas", () => {
  const layout = layoutBeadGraph([]);
  assert.deepEqual(layout.nodes, []);
  assert.deepEqual(layout.edges, []);
});

test("computes edge incoming and outgoing highlight relative to selected node", () => {
  const edge = { fromId: "a", toId: "b" };
  assert.equal(getEdgeHighlight(edge, null), "none");
  assert.equal(getEdgeHighlight(edge, "b"), "incoming");
  assert.equal(getEdgeHighlight(edge, "a"), "outgoing");
  assert.equal(getEdgeHighlight(edge, "c"), "none");
});

test("determines if a node is related to the selected node via incoming or outgoing edges", () => {
  const edges = [{ fromId: "a", toId: "b" }, { fromId: "b", toId: "c" }];
  assert.equal(isNodeRelatedToSelection("a", null, edges), true);
  assert.equal(isNodeRelatedToSelection("b", "b", edges), true); // self
  assert.equal(isNodeRelatedToSelection("a", "b", edges), true); // incoming prereq
  assert.equal(isNodeRelatedToSelection("c", "b", edges), true); // outgoing dependent
  assert.equal(isNodeRelatedToSelection("d", "b", edges), false); // unrelated
});

