import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(join(tmpdir(), "pi-web-lab-takeover-agent-"));
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
const { POST: agentCommand, GET: agentState } = await jiti.import("./[id]/route.ts");
const { GET: agentEvents } = await jiti.import("./[id]/events/route.ts");
const { POST: autoName } = await jiti.import("../sessions/[id]/auto-name/route.ts");
const reader = await jiti.import("../../../lib/session-reader.ts");
const rpc = await jiti.import("../../../lib/rpc-manager.ts");

const registry = () => globalThis.__piSessions ?? new Map();

async function makeLiveLab(sessionId, { role } = {}) {
  const inferred = role ?? sessionId.replace(/^lab-/, "");
  const labPath = await mkdtemp(join(tmpdir(), "pi-web-lab-takeover-lab-"));
  await mkdir(join(labPath, ".lab"), { recursive: true });
  await writeFile(join(labPath, ".lab", "labd.pid"), String(process.pid));
  const seen = [];
  const server = net.createServer((sock) => {
    let buffer = "";
    sock.on("data", (chunk) => {
      buffer += chunk.toString();
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      let payload = {};
      try { payload = JSON.parse(buffer.slice(0, end)); } catch { /* ignore */ }
      seen.push(payload);
      if (payload.cmd === "status") {
        sock.write(JSON.stringify({
          ok: true,
          workers: {
            [inferred]: {
              alive: true, connected: false, busy: false, pending: 0,
              held: false, parked: false, model: "fake-opus", restarts: 0,
            },
          },
        }) + "\n");
      } else {
        sock.write(JSON.stringify({ ok: true, result: "steered" }) + "\n");
      }
      sock.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(join(labPath, ".lab", "labd.sock"), resolve);
  });

  const projectDir = reader.sessionDirForCwd(labPath);
  await mkdir(projectDir, { recursive: true });
  const header = { type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00.000Z", cwd: labPath };
  const user = { type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "status?" } };
  const filePath = join(projectDir, `2026-01-01T00-00-00-000Z_${sessionId}.jsonl`);
  const before = [header, user].map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(filePath, before);
  return {
    labPath, filePath, before, seen, role: inferred,
    async [Symbol.asyncDispose]() {
      await new Promise((resolve) => server.close(resolve));
      await rm(labPath, { recursive: true, force: true });
    },
  };
}

function post(id, command, cwd) {
  const url = `http://localhost/api/agent/${id}` + (cwd ? `?cwd=${encodeURIComponent(cwd)}` : "");
  return agentCommand(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cwd && command.cwd === undefined ? { ...command, cwd } : command),
    }),
    { params: Promise.resolve({ id }) },
  );
}

test("prompts to a live lab worker steer instead of attaching a wrapper", async () => {
  await using lab = await makeLiveLab("lab-probe");
  const response = await post("lab-probe", { type: "prompt", message: "hello?" }, lab.labPath);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, "steered");
  assert.equal(body.data.role, "probe");
  assert.ok(lab.seen.some((p) => p.mode === "steer" && p.role === "probe" && p.message === "hello?"));
  assert.equal(await readFile(lab.filePath, "utf8"), lab.before);
  assert.equal(rpc.getRpcSessionByFile(lab.filePath), undefined);
});

test("a stale hijack wrapper is shut down before steering", async () => {
  await using lab = await makeLiveLab("lab-stale");
  let shutdownCalls = 0;
  const fake = {
    sessionId: "lab-stale",
    cwd: lab.labPath,
    sessionFile: lab.filePath,
    isAlive: () => true,
    shutdown: async () => { shutdownCalls += 1; },
    send: async () => { throw new Error("hijacked"); },
  };
  registry().set("test-stale-wrapper", fake);
  try {
    const response = await post("lab-stale", { type: "prompt", message: "nudge" }, lab.labPath);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, "steered");
    assert.ok(shutdownCalls >= 1, "stale wrapper was not shut down");
    assert.equal(await readFile(lab.filePath, "utf8"), lab.before);
  } finally {
    registry().delete("test-stale-wrapper");
  }
});

test("get_state on a live lab worker reports labd state without attaching", async () => {
  await using lab = await makeLiveLab("lab-state");
  const response = await post("lab-state", { type: "get_state" }, lab.labPath);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.model?.id, "fake-opus");
  assert.equal(body.data.role, "state");
  assert.equal(await readFile(lab.filePath, "utf8"), lab.before);
  assert.equal(rpc.getRpcSessionByFile(lab.filePath), undefined);
});
test("GET on a live worker reports labd state without attaching", async () => {
  await using lab = await makeLiveLab("lab-get");
  const url = `http://localhost/api/agent/lab-get?cwd=${encodeURIComponent(lab.labPath)}`;
  const res = await agentState(new Request(url), { params: Promise.resolve({ id: "lab-get" }) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.running, true);
  assert.equal(data.labWorker, true);
  assert.equal(data.state.model?.id, "fake-opus");
  assert.equal(rpc.getRpcSessionByFile(lab.filePath), undefined);
});

test("model switches and shell runs on a live worker are rejected", async () => {
  await using lab = await makeLiveLab("lab-locked");
  for (const command of [
    { type: "set_model", provider: "p", modelId: "m" },
    { type: "bash", command: "echo hi", excludeFromContext: true },
    { type: "compact" },
    { type: "set_tools", toolNames: [] },
  ]) {
    const response = await post("lab-locked", command, lab.labPath);
    assert.equal(response.status, 409, JSON.stringify(command));
    const body = await response.json();
    assert.equal(body.code, "lab_worker_protected");
  }
  assert.equal(await readFile(lab.filePath, "utf8"), lab.before);
  assert.equal(rpc.getRpcSessionByFile(lab.filePath), undefined);
});

test("a bare lab id shared by two labs demands cwd instead of guessing", async () => {
  await using labA = await makeLiveLab("lab-dup");
  await using labB = await makeLiveLab("lab-dup");
  reader.invalidateSessionListCache();
  const response = await post("lab-dup", { type: "prompt", message: "hello?" });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "cwd_required");
  assert.match(body.error, /lab-dup/);
  assert.equal(await readFile(labA.filePath, "utf8"), labA.before);
  assert.equal(await readFile(labB.filePath, "utf8"), labB.before);
});

test("event streams on a live worker stay healthy without attaching", async () => {
  await using lab = await makeLiveLab("lab-events");
  const url = `http://localhost/api/agent/lab-events?cwd=${encodeURIComponent(lab.labPath)}`;
  const response = await agentEvents(new Request(url), { params: Promise.resolve({ id: "lab-events" }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const streamReader = response.body.getReader();
  const decoder = new TextDecoder();
  let chunk = "";
  for (let i = 0; i < 10 && !chunk.includes("connected"); i++) {
    const { value, done } = await streamReader.read();
    if (value) chunk += decoder.decode(value);
    if (done) break;
  }
  await streamReader.cancel();
  assert.match(chunk, /"type":"connected"/);
  assert.match(chunk, /"labWorker":true/);
  assert.equal(rpc.getRpcSessionByFile(lab.filePath), undefined);
});

test("event streams on an ambiguous bare lab id stay healthy without attaching", async () => {
  await using labA = await makeLiveLab("lab-ambiguous");
  await using labB = await makeLiveLab("lab-ambiguous");
  reader.invalidateSessionListCache();
  const response = await agentEvents(
    new Request("http://localhost/api/agent/lab-ambiguous"),
    { params: Promise.resolve({ id: "lab-ambiguous" }) },
  );
  assert.equal(response.status, 200);
  const streamReader = response.body.getReader();
  const decoder = new TextDecoder();
  let chunk = "";
  for (let i = 0; i < 10 && !chunk.includes("connected"); i++) {
    const { value, done } = await streamReader.read();
    if (value) chunk += decoder.decode(value);
    if (done) break;
  }
  await streamReader.cancel();
  assert.match(chunk, /"type":"connected"/);
  assert.equal(rpc.getRpcSessionByFile(labA.filePath), undefined);
  assert.equal(rpc.getRpcSessionByFile(labB.filePath), undefined);
});

test("auto-naming a live worker is rejected without touching its transcript", async () => {
  await using lab = await makeLiveLab("lab-autoname");
  const url = `http://localhost/api/sessions/lab-autoname?cwd=${encodeURIComponent(lab.labPath)}`;
  const response = await autoName(new Request(url, { method: "POST" }), { params: Promise.resolve({ id: "lab-autoname" }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "lab_worker_protected");
  assert.equal(await readFile(lab.filePath, "utf8"), lab.before);
  assert.equal(rpc.getRpcSessionByFile(lab.filePath), undefined);
});
