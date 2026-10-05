import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./LabsSummaryView.tsx", import.meta.url), "utf8");

test("LabsSummaryView fetches overview from /api/lab/overview", () => {
  assert.match(source, /fetch\("\/api\/lab\/overview"\)/);
});

test("LabsSummaryView defines worker status bubbles for idle, parked, working, held, and dead", () => {
  assert.match(source, /working:\s*\{/);
  assert.match(source, /parked:\s*\{/);
  assert.match(source, /idle:\s*\{/);
  assert.match(source, /held:\s*\{/);
  assert.match(source, /dead:\s*\{/);
  assert.match(source, /BUBBLE_STYLES\[w\.state\]/);
});

test("LabsSummaryView renders global aggregate summary stat cards", () => {
  assert.match(source, /aggregateStats/);
  assert.match(source, /aggregateStats\.workingWorkers/);
  assert.match(source, /aggregateStats\.parkedWorkers/);
  assert.match(source, /aggregateStats\.idleWorkers/);
  assert.match(source, /aggregateStats\.stoppedLabs/);
});

test("LabsSummaryView supports filter chips and search query", () => {
  assert.match(source, /setFilter/);
  assert.match(source, /setSearch/);
  assert.match(source, /Search labs or workers/);
});

test("LabsSummaryView displays worker bubbles inside lab cards and allows one-click navigation", () => {
  assert.match(source, /onSelectLab\(lab\.path/);
  assert.match(source, /Open Lab →/);
  assert.match(source, /lab\.workers\.map/);
});
