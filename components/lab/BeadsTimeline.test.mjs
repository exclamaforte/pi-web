import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./BeadsTimeline.tsx", import.meta.url), "utf8");

test("orders beads by creation date for playback", () => {
  assert.match(source, /orderBeadsForTimeline\(nodes\)/);
});

test("has play/pause/step/speed controls and a history scrubber", () => {
  assert.match(source, /title=\{playing \? "Pause" : "Play"\}/);
  assert.match(source, /title="Step back"/);
  assert.match(source, /title="Step forward"/);
  assert.match(source, /TIMELINE_SPEEDS\.map/);
  assert.match(source, /aria-label="Position in project history"/);
  assert.match(source, /\{revealed\} \/ \{total\}/);
});

test("revealed nodes keep graph status colors; unrevealed stay faint", () => {
  assert.match(source, /colorForStatus\(n\.status\)/);
  assert.match(source, /const isRevealed = i < revealed;/);
});

test("clicking a revealed node loads full bead text into the shared sidebar", () => {
  assert.match(source, /onClick=\{\(\) => isRevealed && openBead\(n\.id\)\}/);
  assert.match(source, /action: "show", path: labPath, bdId: id/);
  assert.match(source, /<BeadDetailPanel bead=\{detail\.bead\}/);
});
