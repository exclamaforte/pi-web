import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMELINE_SPEEDS,
  orderBeadsForTimeline,
  timelineDateLabel,
} from "./beads-timeline.ts";

const bead = (id, created_at) => ({ id, title: id, status: "open", deps: [], created_at });

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
