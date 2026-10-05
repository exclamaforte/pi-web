import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./LabPanel.tsx", import.meta.url), "utf8");

test("LabPanel includes Beads sub-views for List, Graph, Timeline, Memories, and Events", () => {
  assert.match(source, /key:\s*"list",\s*label:\s*"📋 Backlog"/);
  assert.match(source, /key:\s*"graph",\s*label:\s*"🕸️ Graph"/);
  assert.match(source, /key:\s*"timeline",\s*label:\s*"⏳ Timeline"/);
  assert.match(source, /key:\s*"memories",\s*label:\s*"🧠 Memories"/);
  assert.match(source, /key:\s*"events",\s*label:\s*"📜 Events"/);
});

test("LabPanel embeds BeadsMemories and BeadsEvents components", () => {
  assert.match(source, /<BeadsMemories labPath=\{selectedLabPath\} \/>/);
  assert.match(source, /<BeadsEvents labPath=\{selectedLabPath\} \/>/);
});

test("LabPanel includes expanded status filters including in_progress, blocked, deferred, closed, and all", () => {
  assert.match(source, /key:\s*"ready",\s*label:\s*"🟢 Ready"/);
  assert.match(source, /key:\s*"inProgress",\s*label:\s*"🏃 In Progress"/);
  assert.match(source, /key:\s*"blocked",\s*label:\s*"🚫 Blocked"/);
  assert.match(source, /key:\s*"deferred",\s*label:\s*"⏸️ Deferred"/);
  assert.match(source, /key:\s*"closed",\s*label:\s*"✅ Closed"/);
  assert.match(source, /key:\s*"all",\s*label:\s*"🌐 All"/);
});

test("LabPanel includes database overview stats summary banner", () => {
  assert.match(source, /Database Stats:/);
  assert.match(source, /status\.beads\.readyCount/);
  assert.match(source, /status\.beads\.inProgressCount/);
  assert.match(source, /status\.beads\.blockedCount/);
  assert.match(source, /status\.beads\.totalCount/);
});
