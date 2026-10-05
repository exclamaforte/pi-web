import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./BeadsEvents.tsx", import.meta.url), "utf8");

test("events component renders header with bd events badge", () => {
  assert.match(source, /Durable Events Journal/);
  assert.match(source, /bd events/);
  assert.match(source, /append-only/i);
});

test("events component displays notification and instructions when journal is disabled", () => {
  assert.match(source, /bd config set events-journal true/);
  assert.match(source, /!data\.enabled/);
});

test("events component provides operation filters for create, update, close, etc.", () => {
  assert.match(source, /"create"/);
  assert.match(source, /"update"/);
  assert.match(source, /"close"/);
  assert.match(source, /"claim"/);
  assert.match(source, /"comment"/);
  assert.match(source, /"dep_add"/);
});
