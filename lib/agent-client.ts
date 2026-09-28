// Client-side helper for POST /api/agent/[id].
//
// Every /api/agent/[id] route returns one of:
//   { success: true, data: <result> }
//   { error: string }              (non-2xx)
//
// Call sites previously repeated the same 5-line fetch block 13× in
// hooks/useAgentSession.ts. This helper collapses that down to one line.

export class AgentCommandError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly accepted?: boolean,
  ) {
    super(message);
    this.name = "AgentCommandError";
  }
}

export function isPromptRejectedError(error: unknown): error is AgentCommandError {
  return error instanceof AgentCommandError
    && error.code === "prompt_rejected"
    && error.accepted === false;
}

const sessionCwdRegistry = new Map<string, string>();

export function registerSessionCwd(sessionId: string, cwd: string | undefined): void {
  if (cwd) {
    sessionCwdRegistry.set(sessionId, cwd);
  } else {
    sessionCwdRegistry.delete(sessionId);
  }
}

export function getRegisteredSessionCwd(sessionId: string): string | undefined {
  return sessionCwdRegistry.get(sessionId);
}

export function clearRegisteredSessionCwds(): void {
  sessionCwdRegistry.clear();
}

export async function sendAgentCommand<T = unknown>(
  sessionId: string,
  command: Record<string, unknown>,
  cwd?: string,
): Promise<T> {
  const effectiveCwd = cwd
    ?? (typeof command.cwd === "string" ? command.cwd : undefined)
    ?? sessionCwdRegistry.get(sessionId);

  const url = effectiveCwd
    ? `/api/agent/${encodeURIComponent(sessionId)}?cwd=${encodeURIComponent(effectiveCwd)}`
    : `/api/agent/${encodeURIComponent(sessionId)}`;

  const bodyPayload = effectiveCwd && command.cwd === undefined
    ? { ...command, cwd: effectiveCwd }
    : command;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
    accepted?: boolean;
  };
  if (!res.ok || body.error) {
    throw new AgentCommandError(
      body.error ?? `HTTP ${res.status}`,
      res.status,
      body.code,
      body.accepted,
    );
  }
  return body.data as T;
}
