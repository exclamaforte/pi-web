import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./GraphScrollContainer.tsx", import.meta.url), "utf8");

test("defines top and main scroll synchronized container refs", () => {
  assert.match(source, /const topScrollRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /const mainScrollRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /isSyncingRef/);
});

test("renders sticky top horizontal scrollbar with accent styling", () => {
  assert.match(source, /position: "sticky"/);
  assert.match(source, /className="lab-graph-top-scrollbar"/);
  assert.match(source, /aria-label="Graph horizontal scrollbar"/);
});

test("hides native bottom scrollbar while preserving scrollability", () => {
  assert.match(source, /className="hide-scrollbar"/);
  assert.match(source, /scrollbarWidth: "none"/);
  assert.match(source, /-ms-overflow-style|msOverflowStyle: "none"/);
});

test("provides quick pan buttons for scrolling left and right", () => {
  assert.match(source, /aria-label="Scroll graph left"/);
  assert.match(source, /aria-label="Scroll graph right"/);
  assert.match(source, /scrollByAmount\(-300\)/);
  assert.match(source, /scrollByAmount\(300\)/);
});

test("detects overflow dynamically and syncs scroll position", () => {
  assert.match(source, /ResizeObserver/);
  assert.match(source, /topEl\.scrollLeft = mainEl\.scrollLeft/);
  assert.match(source, /mainEl\.scrollLeft = topEl\.scrollLeft/);
});
