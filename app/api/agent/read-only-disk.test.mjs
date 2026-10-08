import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(join(tmpdir(), "pi-web-readonly-disk-agent-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST: agentCommand } = await jiti.import("./[id]/route.ts");
const reader = await jiti.import("../../../lib/session-reader.ts");
const rpc = await jiti.import("../../../lib/rpc-manager.ts");

const registry = () => globalThis.__piSessions ?? new Map();

async function makePlainSession(sessionId) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-readonly-disk-proj-"));
  const projectDir = reader.sessionDirForCwd(cwd);
  await mkdir(projectDir, { recursive: true });
  const filePath = join(projectDir, `2026-01-01T00-00-00-000Z_${sessionId}.jsonl`);
  const lines = [
    { type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00.000Z", cwd },
    { type: "model_change", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", provider: "test-prov", modelId: "test-model" },
    { type: "thinking_level_change", id: "t1", parentId: "m1", timestamp: "2026-01-01T00:00:02.000Z", thinkingLevel: "high" },
    {
      type: "message", id: "u1", parentId: "t1", timestamp: "2026-01-01T00:00:03.000Z",
      message: { role: "user", content: "hello" },
    },
    {
      type: "message", id: "a1", parentId: "u1", timestamp: "2026-01-01T00:00:04.000Z",
      message: {
        role: "assistant", provider: "test-prov", model: "test-model",
        content: [{ type: "text", text: "hi there" }],
        usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, cost: { total: 0.001 } },
      },
    },
  ];
  await writeFile(filePath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return {
    cwd,
    filePath,
    async [Symbol.asyncDispose]() {
      reader.invalidateSessionManagerCache(filePath);
      reader.invalidateSessionPathCache(sessionId);
      await rm(cwd, { recursive: true, force: true });
    },
  };
}

function post(id, command, cwd) {
  const url = `http://localhost/api/agent/${id}?cwd=${encodeURIComponent(cwd)}`;
  return agentCommand(new Request(url, { method: "POST", body: JSON.stringify(command) }), {
    params: Promise.resolve({ id }),
  });
}

test("get_state on a dormant session is served from disk without attaching", async () => {
  await using plain = await makePlainSession("plain-state");
  const res = await post("plain-state", { type: "get_state" }, plain.cwd);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data.model, { provider: "test-prov", id: "test-model" });
  assert.equal(body.data.thinkingLevel, "high");
  assert.equal(body.data.isStreaming, false);
  assert.equal(body.data.isPromptRunning, false);
  assert.equal(body.data.systemPrompt, "");
  assert.equal(rpc.getRpcSessionByFile(plain.filePath), undefined);
});

test("get_session_stats on a dormant session mirrors the SDK aggregation without attaching", async () => {
  await using plain = await makePlainSession("plain-stats");
  const res = await post("plain-stats", { type: "get_session_stats" }, plain.cwd);
  assert.equal(res.status, 200);
  const data = (await res.json()).data;
  assert.equal(data.sessionId, "plain-stats");
  assert.equal(data.userMessages, 1);
  assert.equal(data.assistantMessages, 1);
  assert.equal(data.tokens.input, 100);
  assert.equal(data.tokens.output, 20);
  assert.equal(rpc.getRpcSessionByFile(plain.filePath), undefined);
});

test("get_last_assistant_text on a dormant session is served from disk without attaching", async () => {
  await using plain = await makePlainSession("plain-copy");
  const res = await post("plain-copy", { type: "get_last_assistant_text" }, plain.cwd);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.text, "hi there");
  assert.equal(rpc.getRpcSessionByFile(plain.filePath), undefined);
});

test("a live wrapper stays authoritative for reads when present", async () => {
  await using plain = await makePlainSession("plain-live");
  const marker = { live: true, isStreaming: true };
  const fake = {
    sessionId: "plain-live",
    cwd: plain.cwd,
    sessionFile: plain.filePath,
    isAlive: () => true,
    send: async () => marker,
    shutdown: async () => {},
  };
  registry().set("test-readonly-live", fake);
  try {
    const res = await post("plain-live", { type: "get_state" }, plain.cwd);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).data, marker);
  } finally {
    registry().delete("test-readonly-live");
  }
});
