import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST: agentCommand, GET: agentState } = await jiti.import("./[id]/route.ts");
const { sessionDirForCwd } = await jiti.import("../../../lib/session-reader.ts");

const SESSION_ID = "lab-guardprobe";

async function makeDeadLab(t) {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-web-lab-guard-agent-"));
  const labPath = await mkdtemp(join(tmpdir(), "pi-web-lab-guard-lab-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(agentDir, { recursive: true, force: true });
    await rm(labPath, { recursive: true, force: true });
  });

  // No .lab/labd.pid: the daemon is down.
  const projectDir = sessionDirForCwd(labPath);
  await mkdir(projectDir, { recursive: true });
  const header = { type: "session", version: 3, id: SESSION_ID, timestamp: "2026-01-01T00:00:00.000Z", cwd: labPath };
  const user = { type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "status?" } };
  const asst = {
    type: "message", id: "a1", parentId: "u1", timestamp: "2026-01-01T00:00:01.000Z",
    message: { role: "assistant", provider: "p", model: "m", content: [{ type: "text", text: "ok" }] },
  };
  const filePath = join(projectDir, `2026-01-01T00-00-00-000Z_${SESSION_ID}.jsonl`);
  const before = [header, user, asst].map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(filePath, before);
  return { labPath, filePath, before };
}

const context = { params: Promise.resolve({ id: SESSION_ID }) };

test("prompts to a dead-daemon lab worker are rejected without touching its transcript", async (t) => {
  const { labPath, filePath, before } = await makeDeadLab(t);
  const url = `http://localhost/api/agent/${SESSION_ID}?cwd=${encodeURIComponent(labPath)}`;

  const response = await agentCommand(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "prompt", message: "hello?", cwd: labPath }),
    }),
    context,
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "prompt_rejected");
  assert.equal(body.accepted, false);
  assert.match(body.error, /daemon is down/);
  assert.equal(await readFile(filePath, "utf8"), before);
});

test("reads against a dead-daemon lab worker still work", async (t) => {
  const { labPath } = await makeDeadLab(t);
  const url = `http://localhost/api/agent/${SESSION_ID}?cwd=${encodeURIComponent(labPath)}`;

  const state = await agentState(new Request(url), context);
  assert.equal(state.status, 200);
  const data = await state.json();
  assert.equal(data.running, false);
  assert.equal(data.labWorker, true);
  assert.equal(data.readOnly, true);
  assert.equal(data.role, "guardprobe");
});

test("the read-only gate keeps fork-family ops allowed", async () => {
  const route = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8");
  for (const allowed of ["get_state", "fork", "fork_branch", "clone", "abort"]) {
    assert.match(route, new RegExp(`"${allowed}"`));
  }
  assert.match(route, /!LAB_READONLY_OK\.has\(body\.type\)/);
  assert.match(route, /status: 409/);
});
