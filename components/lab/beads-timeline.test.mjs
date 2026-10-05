import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMELINE_SPEEDS,
  orderBeadsForTimeline,
  timelineDateLabel,
  formatEventTime,
  buildTimelineEvents,
  getTimelineGraphState,
} from "./beads-timeline.ts";

const bead = (id, created_at, closed_at, status = "open") => ({
  id,
  title: id,
  status,
  deps: [],
  created_at,
  closed_at,
});

test("orders beads by creation date with stable id tiebreak", () => {
  const ordered = orderBeadsForTimeline([
    bead("b", "2026-10-04T19:16:39Z"),
    bead("a", "2026-09-24T05:56:37Z"),
    bead("c", "2026-09-24T05:56:37Z"),
  ]).map((n) => n.id);
  assert.deepEqual(ordered, ["a", "c", "b"]);
});

test("beads without timestamps sort last without mutating input", () => {
  const input = [bead("x", undefined), bead("a", "2026-09-24T05:56:37Z")];
  const ordered = orderBeadsForTimeline(input).map((n) => n.id);
  assert.deepEqual(ordered, ["a", "x"]);
  assert.equal(input[0].id, "x");
});

test("playback speeds cover sub-second to fast review", () => {
  assert.deepEqual([...TIMELINE_SPEEDS], [0.5, 1, 2, 4]);
});

test("date labels shorten to the calendar day", () => {
  assert.equal(timelineDateLabel("2026-10-04T19:16:39Z"), "2026-10-04");
  assert.equal(timelineDateLabel(undefined), "undated");
});

test("formatEventTime formats ISO timestamps cleanly", () => {
  assert.equal(formatEventTime("2026-10-04T19:16:39Z"), "2026-10-04 19:16:39");
  assert.equal(formatEventTime(undefined), "undated");
});

test("buildTimelineEvents creates creation and completion events in order", () => {
  const nodes = [
    bead("b1", "2026-09-24T05:00:00Z", "2026-09-24T07:00:00Z", "closed"),
    bead("b2", "2026-09-24T06:00:00Z", undefined, "in_progress"),
  ];
  const events = buildTimelineEvents(nodes);
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((e) => ({ beadId: e.beadId, type: e.type, time: e.timestamp })),
    [
      { beadId: "b1", type: "created", time: "2026-09-24T05:00:00Z" },
      { beadId: "b2", type: "created", time: "2026-09-24T06:00:00Z" },
      { beadId: "b1", type: "completed", time: "2026-09-24T07:00:00Z" },
    ]
  );
});

test("buildTimelineEvents puts created before completed if timestamps match", () => {
  const nodes = [
    bead("quick", "2026-09-24T12:00:00Z", "2026-09-24T12:00:00Z", "closed"),
  ];
  const events = buildTimelineEvents(nodes);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "created");
  assert.equal(events[1].type, "completed");
});

test("getTimelineGraphState updates node statuses and counts with each tick", () => {
  const nodes = [
    bead("b1", "2026-09-24T05:00:00Z", "2026-09-24T07:00:00Z", "closed"),
    bead("b2", "2026-09-24T06:00:00Z", undefined, "in_progress"),
  ];
  const events = buildTimelineEvents(nodes);

  // Tick 0: Nothing created yet
  const t0 = getTimelineGraphState(nodes, events, 0);
  assert.equal(t0.createdCount, 0);
  assert.equal(t0.completedCount, 0);
  assert.equal(t0.activeCount, 0);
  assert.equal(t0.nodeStates.get("b1")?.effectiveStatus, "uncreated");
  assert.equal(t0.nodeStates.get("b2")?.effectiveStatus, "uncreated");

  // Tick 1: b1 created
  const t1 = getTimelineGraphState(nodes, events, 1);
  assert.equal(t1.createdCount, 1);
  assert.equal(t1.completedCount, 0);
  assert.equal(t1.activeCount, 1);
  assert.equal(t1.nodeStates.get("b1")?.effectiveStatus, "open");
  assert.equal(t1.nodeStates.get("b1")?.isCurrentChange, true);
  assert.equal(t1.nodeStates.get("b2")?.effectiveStatus, "uncreated");

  // Tick 2: b2 created
  const t2 = getTimelineGraphState(nodes, events, 2);
  assert.equal(t2.createdCount, 2);
  assert.equal(t2.completedCount, 0);
  assert.equal(t2.activeCount, 2);
  assert.equal(t2.nodeStates.get("b1")?.effectiveStatus, "open");
  assert.equal(t2.nodeStates.get("b2")?.effectiveStatus, "in_progress");
  assert.equal(t2.nodeStates.get("b2")?.isCurrentChange, true);

  // Tick 3: b1 completed
  const t3 = getTimelineGraphState(nodes, events, 3);
  assert.equal(t3.createdCount, 2);
  assert.equal(t3.completedCount, 1);
  assert.equal(t3.activeCount, 1);
  assert.equal(t3.nodeStates.get("b1")?.effectiveStatus, "closed");
  assert.equal(t3.nodeStates.get("b1")?.isCurrentChange, true);
  assert.equal(t3.nodeStates.get("b2")?.effectiveStatus, "in_progress");
});
