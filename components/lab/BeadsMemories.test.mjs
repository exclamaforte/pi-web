import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./BeadsMemories.tsx", import.meta.url), "utf8");

test("memories component renders header with bd remember badge and explanation", () => {
  assert.match(source, /Persistent Memories/);
  assert.match(source, /bd remember/);
  assert.match(source, /bd prime/);
});

test("memories component supports live search and filtering", () => {
  assert.match(source, /placeholder="Search memories by keyword\.\.\."/);
  assert.match(source, /view=memories/);
});

test("memories component provides form to remember new insights", () => {
  assert.match(source, /action:\s*"remember"/);
  assert.match(source, /insightInput/);
  assert.match(source, /keyInput/);
  assert.match(source, /➕ Remember New/);
});

test("memories component supports forgetting stored memories", () => {
  assert.match(source, /action:\s*"forget"/);
  assert.match(source, /handleForget/);
  assert.match(source, /🗑️ Forget/);
});
