import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  AgentCommandError,
  isPromptRejectedError,
  sendAgentCommand,
  registerSessionCwd,
  getRegisteredSessionCwd,
  clearRegisteredSessionCwds,
} = await jiti.import("./agent-client.ts");

test("agent command HTTP rejections are distinguishable from transport failures", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response(
    JSON.stringify({
      error: "Authentication failed",
      code: "prompt_rejected",
      accepted: false,
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );

  await assert.rejects(
    sendAgentCommand("session-id", { type: "prompt", message: "hello" }),
    (error) => {
      assert.equal(error instanceof AgentCommandError, true);
      assert.equal(error.status, 500);
      assert.equal(error.message, "Authentication failed");
      assert.equal(error.code, "prompt_rejected");
      assert.equal(error.accepted, false);
      assert.equal(isPromptRejectedError(error), true);
      return true;
    },
  );

  const transportError = new TypeError("connection reset");
  globalThis.fetch = async () => {
    throw transportError;
  };

  await assert.rejects(
    sendAgentCommand("session-id", { type: "prompt", message: "hello" }),
    (error) => {
      assert.equal(error, transportError);
      assert.equal(error instanceof AgentCommandError, false);
      assert.equal(isPromptRejectedError(error), false);
      return true;
    },
  );
});

test("only an explicit negative prompt acknowledgement is definitive", () => {
  assert.equal(
    isPromptRejectedError(new AgentCommandError("proxy failure", 502)),
    false,
  );
  assert.equal(
    isPromptRejectedError(new AgentCommandError("generic API failure", 500, "internal_error", false)),
    false,
  );
});

test("sendAgentCommand propagates cwd from registry, explicit param, or command body", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearRegisteredSessionCwds();
  });

  let lastUrl = "";
  let lastBody = {};

  globalThis.fetch = async (url, init) => {
    lastUrl = String(url);
    lastBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  // 1. Without cwd
  await sendAgentCommand("sess-1", { type: "compact" });
  assert.equal(lastUrl, "/api/agent/sess-1");
  assert.equal(lastBody.cwd, undefined);

  // 2. With registered cwd
  registerSessionCwd("sess-1", "/path/to/project");
  assert.equal(getRegisteredSessionCwd("sess-1"), "/path/to/project");
  await sendAgentCommand("sess-1", { type: "compact" });
  assert.equal(lastUrl, "/api/agent/sess-1?cwd=%2Fpath%2Fto%2Fproject");
  assert.equal(lastBody.cwd, "/path/to/project");

  // 3. With explicit cwd parameter overriding registered
  await sendAgentCommand("sess-1", { type: "compact" }, "/override/path");
  assert.equal(lastUrl, "/api/agent/sess-1?cwd=%2Foverride%2Fpath");
  assert.equal(lastBody.cwd, "/override/path");

  // 4. With command.cwd
  await sendAgentCommand("sess-2", { type: "get_state", cwd: "/from/command" });
  assert.equal(lastUrl, "/api/agent/sess-2?cwd=%2Ffrom%2Fcommand");
  assert.equal(lastBody.cwd, "/from/command");

  // 5. Unregister
  registerSessionCwd("sess-1", undefined);
  assert.equal(getRegisteredSessionCwd("sess-1"), undefined);
  await sendAgentCommand("sess-1", { type: "compact" });
  assert.equal(lastUrl, "/api/agent/sess-1");
  assert.equal(lastBody.cwd, undefined);
});

test("conflicting cwd registrations for one id resolve to nothing", async (t) => {
  t.after(() => {
    clearRegisteredSessionCwds();
  });

  registerSessionCwd("lab-implementer", "/labs/a");
  assert.equal(getRegisteredSessionCwd("lab-implementer"), "/labs/a");
  registerSessionCwd("lab-implementer", "/labs/a");
  assert.equal(getRegisteredSessionCwd("lab-implementer"), "/labs/a");
  registerSessionCwd("lab-implementer", "/labs/b");
  assert.equal(getRegisteredSessionCwd("lab-implementer"), undefined);
});

