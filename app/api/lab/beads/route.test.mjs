import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET } = await jiti.import("./route.ts");

const LAB = "/home/gabe/pi-research-lab";

test("GET requires the lab path parameter", async () => {
  const res = await GET(new Request("http://localhost/api/lab/beads"));
  assert.equal(res.status, 400);
});

test("GET returns all lab beads with dependency edges", async () => {
  const res = await GET(
    new Request(`http://localhost/api/lab/beads?path=${encodeURIComponent(LAB)}`)
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data) && json.data.length > 0);
  for (const n of json.data) {
    assert.ok(typeof n.id === "string" && n.id.length > 0);
    assert.ok(typeof n.title === "string");
    assert.ok(typeof n.status === "string");
    assert.ok(Array.isArray(n.deps));
  }
  const byId = new Map(json.data.map((n) => [n.id, n]));
  const s14 = byId.get("pi-research-lab-s14");
  assert.ok(s14, "s14 present in graph");
  const dependents = json.data.filter((n) => n.deps.includes("pi-research-lab-s14"));
  assert.ok(
    dependents.length > 0,
    "at least one bead depends on s14 (correct edges)"
  );
});
