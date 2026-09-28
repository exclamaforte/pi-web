import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LabWorkerStatus {
  role: string;
  sessionId: string;
  name?: string;
  alive: boolean;
  connected: boolean;
  busy: boolean;
  pending: number;
  held: boolean;
  restarts: number;
  model?: string;
  prompt?: string;
}

export interface LabDaemonStatus {
  alive: boolean;
  pid?: number;
  host?: string;
  idleSeconds?: number;
  idleTimeoutSeconds?: number;
  gpuActive?: boolean;
  gpuEmptySeconds?: number;
  gpuIdleTimeoutSeconds?: number;
}

export interface BeadItem {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  status: string;
  priority?: number;
  issue_type?: string;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
  dependent_count?: number;
  dependency_count?: number;
  comment_count?: number;
}

export interface GpuJob {
  id: string;
  state: "running" | "queued" | "finished" | "failed" | "canceled" | "timed_out" | "killed_underused" | string;
  runtime: string;
  command: string;
}

export interface ExperimentSummary {
  id: string;
  path: string;
  hasMetrics: boolean;
  hasLog: boolean;
  hasJob: boolean;
  mtimeMs: number;
}

export interface LabSummary {
  id: string;
  name: string;
  path: string;
  hasConfig: boolean;
  hasFlow: boolean;
  daemonAlive: boolean;
  workersCount: number;
  activeWorkersCount: number;
}

export interface LabFullStatus {
  lab: LabSummary;
  daemon: LabDaemonStatus;
  workers: Record<string, LabWorkerStatus>;
  beads: {
    readyCount: number;
    needsReviewCount: number;
    returnedCount: number;
    needsReproduceCount: number;
    ready: BeadItem[];
    needsReview: BeadItem[];
    returned: BeadItem[];
    needsReproduce: BeadItem[];
  };
  gpuQueue: {
    available: boolean;
    running: GpuJob[];
    queued: GpuJob[];
    recent: GpuJob[];
  };
  inboxes: Record<string, string[]>;
  experiments: ExperimentSummary[];
  daemonLogs: string[];
}

const DEFAULT_ROLES = ["pi", "implementer", "reviewer"];

/** Locate lab CLI executable */
export function getLabCliPath(): string {
  const custom = join(homedir(), "pi-research-lab", "bin", "lab");
  if (existsSync(custom)) return custom;
  const script = join(homedir(), "pi-research-lab", "lab.py");
  if (existsSync(script)) return script;
  return "lab";
}

/** Locate gpqueue executable */
export function getGpqueueCli(): { bin: string; args: string[] } {
  const docFallback = join(homedir(), "Documents", "gpqueue", "gpqueue.py");
  if (existsSync(docFallback)) {
    return { bin: "python3", args: [docFallback] };
  }
  return { bin: "gpqueue.py", args: [] };
}

/** Check whether a daemon process is currently alive */
export function isDaemonAlive(labPath: string): { alive: boolean; pid?: number } {
  const pidPath = join(labPath, ".lab", "labd.pid");
  if (!existsSync(pidPath)) return { alive: false };
  try {
    const raw = readFileSync(pidPath, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (!pid || isNaN(pid)) return { alive: false };
    process.kill(pid, 0);
    return { alive: true, pid };
  } catch {
    return { alive: false };
  }
}

/** Send JSON request over Unix domain socket to labd */
export async function sendLabdIpc(
  labPath: string,
  payload: Record<string, unknown>,
  timeoutMs = 4000,
): Promise<any> {
  const sockPath = join(labPath, ".lab", "labd.sock");
  if (!existsSync(sockPath)) {
    return { ok: false, error: "labd socket does not exist" };
  }

  return new Promise((resolveResult) => {
    let finished = false;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const client = net.createConnection({ path: sockPath }, () => {
      client.write(JSON.stringify(payload) + "\n");
    });

    let buffer = "";

    client.on("data", (chunk) => {
      buffer += chunk.toString();
    });

    client.on("end", () => {
      if (finished) return;
      finished = true;
      cleanup();
      try {
        resolveResult(JSON.parse(buffer || "{}"));
      } catch {
        resolveResult({ ok: false, error: "Invalid JSON from labd socket" });
      }
    });

    client.on("error", (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolveResult({ ok: false, error: err.message });
    });

    timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      client.destroy();
      resolveResult({ ok: false, error: "IPC connection timeout" });
    }, timeoutMs);
  });
}

/** Discover all lab directories */
export function discoverLabs(additionalPaths: string[] = []): LabSummary[] {
  const candidateDirs = new Set<string>();

  // Known workspaces in home and Documents
  const home = homedir();
  const docsDir = join(home, "Documents");

  candidateDirs.add(join(home, "pi-research-lab"));
  candidateDirs.add(join(home, "pi-research-lab-router"));

  if (existsSync(docsDir)) {
    try {
      const entries = readdirSync(docsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          candidateDirs.add(join(docsDir, ent.name));
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  for (const p of additionalPaths) {
    if (p) candidateDirs.add(resolve(p));
  }

  const results: LabSummary[] = [];

  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    const configPath = join(dir, "lab.config.json");
    const flowPath = join(dir, "lab.flow");
    const labDir = join(dir, ".lab");

    const hasConfig = existsSync(configPath);
    const hasFlow = existsSync(flowPath);
    const hasLab = existsSync(labDir);

    if (!hasConfig && !hasFlow && !hasLab) continue;

    let name = basename(dir);
    let workerCount = 3;
    if (hasConfig) {
      try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8"));
        if (parsed.roles) {
          workerCount = Object.keys(parsed.roles).length;
        }
      } catch {
        // ignore JSON error
      }
    }

    const { alive } = isDaemonAlive(dir);

    results.push({
      id: basename(dir),
      name,
      path: dir,
      hasConfig,
      hasFlow,
      daemonAlive: alive,
      workersCount: workerCount,
      activeWorkersCount: alive ? workerCount : 0,
    });
  }

  return results.sort((a, b) => {
    // Put active labs first, then alphabetical
    if (a.daemonAlive && !b.daemonAlive) return -1;
    if (!a.daemonAlive && b.daemonAlive) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Read beads data using bd command line */
export async function getBeadsData(labPath: string): Promise<{
  ready: BeadItem[];
  needsReview: BeadItem[];
  returned: BeadItem[];
  needsReproduce: BeadItem[];
}> {
  const env = {
    ...process.env,
    PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
  };

  const runBd = async (args: string[]): Promise<BeadItem[]> => {
    try {
      const { stdout } = await execFileAsync("bd", args, {
        cwd: labPath,
        timeout: 10000,
        env,
      });
      const data = JSON.parse(stdout || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const [ready, needsReview, returned, needsReproduce] = await Promise.all([
    runBd(["ready", "--json", "--limit", "0"]),
    runBd(["list", "--json", "--limit", "0", "-l", "needs-review"]),
    runBd(["list", "--json", "--limit", "0", "-l", "needs-rework"]),
    runBd(["list", "--json", "--limit", "0", "-l", "needs-reproduce"]),
  ]);

  return { ready, needsReview, returned, needsReproduce };
}

/** Read GPU queue using gpqueue.py status */
export async function getGpuQueueStatus(): Promise<{
  available: boolean;
  running: GpuJob[];
  queued: GpuJob[];
  recent: GpuJob[];
}> {
  const { bin, args } = getGpqueueCli();
  try {
    const { stdout } = await execFileAsync(bin, [...args, "status"], {
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    const running: GpuJob[] = [];
    const queued: GpuJob[] = [];
    const recent: GpuJob[] = [];

    const lines = stdout.split("\n");
    const jobRegex = /^([a-zA-Z0-9_\-\.]+)\s+([a-zA-Z0-9_\-]+)\s+([^\s]+)\s+(.*)$/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("ID") || trimmed.startsWith("---")) continue;
      const match = trimmed.match(jobRegex);
      if (!match) continue;

      const job: GpuJob = {
        id: match[1],
        state: match[2].toLowerCase(),
        runtime: match[3],
        command: match[4],
      };

      if (job.state === "running") {
        running.push(job);
      } else if (job.state === "queued") {
        queued.push(job);
      } else {
        recent.push(job);
      }
    }

    return {
      available: true,
      running,
      queued,
      recent: recent.slice(0, 15),
    };
  } catch {
    return {
      available: false,
      running: [],
      queued: [],
      recent: [],
    };
  }
}

/** Get logs for a GPU job */
export async function getGpuJobLogs(jobId: string): Promise<string> {
  const { bin, args } = getGpqueueCli();
  try {
    const { stdout } = await execFileAsync(bin, [...args, "logs", jobId], {
      timeout: 10000,
    });
    return stdout;
  } catch (err) {
    return `Error fetching logs: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Cancel a GPU job */
export async function cancelGpuJob(jobId: string): Promise<{ ok: boolean; message: string }> {
  const { bin, args } = getGpqueueCli();
  try {
    const { stdout, stderr } = await execFileAsync(bin, [...args, "cancel", jobId], {
      timeout: 10000,
    });
    return { ok: true, message: (stdout || stderr || "Job canceled").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Read role inboxes */
export function getLabInboxes(labPath: string, roles: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const inboxDir = join(labPath, ".lab", "inbox");

  for (const role of roles) {
    const filePath = join(inboxDir, `${role}.md`);
    if (!existsSync(filePath)) {
      result[role] = [];
      continue;
    }
    try {
      const content = readFileSync(filePath, "utf8");
      const sections = content
        .split(/(?=^##\s+)/m)
        .map((s) => s.trim())
        .filter(Boolean);
      result[role] = sections.slice(-5); // last 5 messages
    } catch {
      result[role] = [];
    }
  }

  return result;
}

/** Read recent experiment runs */
export function getRecentExperiments(labPath: string): ExperimentSummary[] {
  const expDir = join(labPath, "experiments");
  if (!existsSync(expDir)) return [];

  try {
    const entries = readdirSync(expDir, { withFileTypes: true });
    const list: ExperimentSummary[] = [];

    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const full = join(expDir, ent.name);
      try {
        const stat = statSync(full);
        list.push({
          id: ent.name,
          path: full,
          hasMetrics: existsSync(join(full, "metrics.json")),
          hasLog: existsSync(join(full, "output.log")),
          hasJob: existsSync(join(full, "job.json")),
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        // ignore error
      }
    }

    return list.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 20);
  } catch {
    return [];
  }
}

/** Read daemon log tail */
export function getDaemonLogTail(labPath: string, maxLines = 100): string[] {
  const logFile = join(labPath, ".lab", "labd.log");
  if (!existsSync(logFile)) return [];

  try {
    const content = readFileSync(logFile, "utf8");
    const lines = content.split("\n");
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/** Read full status of a lab */
export async function getFullLabStatus(labPath: string): Promise<LabFullStatus> {
  const absPath = resolve(labPath);
  const configPath = join(absPath, "lab.config.json");
  const flowPath = join(absPath, "lab.flow");

  let config: any = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      // ignore
    }
  }

  const roleNames = config.roles ? Object.keys(config.roles) : DEFAULT_ROLES;
  const { alive: daemonAlive, pid } = isDaemonAlive(absPath);

  let daemonStatus: LabDaemonStatus = { alive: daemonAlive, pid };
  const workers: Record<string, LabWorkerStatus> = {};

  // Initialize workers with config defaults
  for (const role of roleNames) {
    const rConfig = config.roles?.[role] || {};
    workers[role] = {
      role,
      sessionId: rConfig.sessionId || `lab-${role}`,
      name: rConfig.name || `Lab ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      alive: false,
      connected: false,
      busy: false,
      pending: 0,
      held: false,
      restarts: 0,
      model: rConfig.model,
      prompt: rConfig.prompt,
    };
  }

  // If daemon is alive, query socket status
  if (daemonAlive) {
    const ipcRes = await sendLabdIpc(absPath, { cmd: "status" }, 3000);
    if (ipcRes?.ok) {
      daemonStatus = {
        alive: true,
        pid,
        host: ipcRes.host,
        idleSeconds: ipcRes.idle_seconds,
        idleTimeoutSeconds: ipcRes.idle_timeout_seconds,
        gpuActive: ipcRes.gpu_active,
        gpuEmptySeconds: ipcRes.gpu_empty_seconds,
        gpuIdleTimeoutSeconds: ipcRes.gpu_idle_timeout_seconds,
      };

      if (ipcRes.workers) {
        for (const [r, w] of Object.entries<any>(ipcRes.workers)) {
          if (!workers[r]) {
            workers[r] = {
              role: r,
              sessionId: `lab-${r}`,
              alive: w.alive ?? false,
              connected: w.connected ?? false,
              busy: w.busy ?? false,
              pending: w.pending ?? 0,
              held: w.held ?? false,
              restarts: w.restarts ?? 0,
              model: w.model,
            };
          } else {
            workers[r].alive = w.alive ?? false;
            workers[r].connected = w.connected ?? false;
            workers[r].busy = w.busy ?? false;
            workers[r].pending = w.pending ?? 0;
            workers[r].held = w.held ?? false;
            workers[r].restarts = w.restarts ?? 0;
            if (w.model) workers[r].model = w.model;
          }
        }
      }
    }
  }

  const [beads, gpuQueue] = await Promise.all([
    getBeadsData(absPath),
    getGpuQueueStatus(),
  ]);

  const inboxes = getLabInboxes(absPath, roleNames);
  const experiments = getRecentExperiments(absPath);
  const daemonLogs = getDaemonLogTail(absPath, 80);

  const labSummary: LabSummary = {
    id: basename(absPath),
    name: basename(absPath),
    path: absPath,
    hasConfig: existsSync(configPath),
    hasFlow: existsSync(flowPath),
    daemonAlive,
    workersCount: roleNames.length,
    activeWorkersCount: Object.values(workers).filter((w) => w.alive).length,
  };

  return {
    lab: labSummary,
    daemon: daemonStatus,
    workers,
    beads: {
      readyCount: beads.ready.length,
      needsReviewCount: beads.needsReview.length,
      returnedCount: beads.returned.length,
      needsReproduceCount: beads.needsReproduce.length,
      ready: beads.ready,
      needsReview: beads.needsReview,
      returned: beads.returned,
      needsReproduce: beads.needsReproduce,
    },
    gpuQueue,
    inboxes,
    experiments,
    daemonLogs,
  };
}

/** Execute steer action on a worker */
export async function steerLabWorker(
  labPath: string,
  role: string,
  message: string,
  from = "human",
): Promise<{ ok: boolean; result?: string; error?: string }> {
  const { alive } = isDaemonAlive(labPath);
  if (alive) {
    const res = await sendLabdIpc(labPath, {
      role,
      message,
      mode: "steer",
      source: from,
    });
    if (res?.ok) return { ok: true, result: res.result || "steered" };
  }

  // Fallback to CLI
  try {
    const labBin = getLabCliPath();
    const isPy = labBin.endsWith(".py");
    const cmd = isPy ? "python3" : labBin;
    const args = isPy
      ? [labBin, "steer", "--from", from, role, message]
      : ["steer", "--from", from, role, message];

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: labPath,
      timeout: 10000,
      env: {
        ...process.env,
        LAB_ROOT: labPath,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    return { ok: true, result: (stdout || stderr || "steered").trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Send message to a worker inbox */
export async function sendLabInbox(
  labPath: string,
  role: string,
  message: string,
  from = "human",
): Promise<{ ok: boolean; message: string }> {
  try {
    const labBin = getLabCliPath();
    const isPy = labBin.endsWith(".py");
    const cmd = isPy ? "python3" : labBin;
    const args = isPy
      ? [labBin, "send", "--from", from, role, message]
      : ["send", "--from", from, role, message];

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: labPath,
      timeout: 10000,
      env: {
        ...process.env,
        LAB_ROOT: labPath,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    return { ok: true, message: (stdout || stderr || "Sent to inbox").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Restart one or all lab workers */
export async function restartLabRoles(
  labPath: string,
  roles?: string[],
): Promise<{ ok: boolean; message: string }> {
  const { alive } = isDaemonAlive(labPath);
  if (alive && roles && roles.length > 0) {
    const res = await sendLabdIpc(labPath, { cmd: "restart", roles });
    if (res?.ok) {
      return { ok: true, message: `Restarted: ${res.restarted?.join(", ") || roles.join(", ")}` };
    }
  }

  // Fallback to CLI
  try {
    const labBin = getLabCliPath();
    const isPy = labBin.endsWith(".py");
    const cmd = isPy ? "python3" : labBin;
    const args = isPy
      ? [labBin, "restart", ...(roles || [])]
      : ["restart", ...(roles || [])];

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: labPath,
      timeout: 15000,
      env: {
        ...process.env,
        LAB_ROOT: labPath,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    return { ok: true, message: (stdout || stderr || "Restarted").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Spawn lab daemon & workers */
export async function spawnLab(
  labPath: string,
  options?: { host?: string; model?: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    const labBin = getLabCliPath();
    const isPy = labBin.endsWith(".py");
    const cmd = isPy ? "python3" : labBin;
    const args = isPy ? [labBin, "spawn"] : ["spawn"];

    if (options?.host) {
      args.push("--host", options.host);
    }
    if (options?.model) {
      args.push("--model", options.model);
    }

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: labPath,
      timeout: 30000,
      env: {
        ...process.env,
        LAB_ROOT: labPath,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    return { ok: true, message: (stdout || stderr || "Lab spawned").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Stop lab daemon & workers */
export async function stopLab(labPath: string): Promise<{ ok: boolean; message: string }> {
  try {
    const labBin = getLabCliPath();
    const isPy = labBin.endsWith(".py");
    const cmd = isPy ? "python3" : labBin;
    const args = isPy ? [labBin, "stop"] : ["stop"];

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: labPath,
      timeout: 25000,
      env: {
        ...process.env,
        LAB_ROOT: labPath,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    return { ok: true, message: (stdout || stderr || "Lab stopped").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Review request or approve GPU reproduce */
export async function reviewRequestLab(
  labPath: string,
  bdId: string,
  reproduce = false,
): Promise<{ ok: boolean; message: string }> {
  try {
    const labBin = getLabCliPath();
    const isPy = labBin.endsWith(".py");
    const cmd = isPy ? "python3" : labBin;
    const args = isPy
      ? [labBin, "review-request", bdId]
      : ["review-request", bdId];

    if (reproduce) args.push("--reproduce");

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: labPath,
      timeout: 10000,
      env: {
        ...process.env,
        LAB_ROOT: labPath,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });

    return { ok: true, message: (stdout || stderr || "Review request updated").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Comment on a bead */
export async function commentBead(
  labPath: string,
  bdId: string,
  message: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("bd", ["comment", bdId, message], {
      cwd: labPath,
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
      },
    });
    return { ok: true, message: (stdout || stderr || "Comment posted").trim() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Check if a session belongs to a lab worker */
export function isLabSession(
  sessionId: string,
  cwd?: string | null,
): { isLab: boolean; role?: string; labPath?: string } {
  if (!sessionId) return { isLab: false };

  // Match standard lab session ID patterns: lab-pi, lab-implementer, lab-reviewer
  const roleMatch = sessionId.match(/^lab-([a-zA-Z0-9_\-]+)$/);
  if (roleMatch) {
    return {
      isLab: true,
      role: roleMatch[1],
      labPath: cwd || undefined,
    };
  }

  // Check if cwd is a lab directory
  if (cwd) {
    const hasConfig = existsSync(join(cwd, "lab.config.json"));
    const hasLab = existsSync(join(cwd, ".lab"));
    if (hasConfig || hasLab) {
      if (sessionId.includes("pi")) return { isLab: true, role: "pi", labPath: cwd };
      if (sessionId.includes("implementer")) return { isLab: true, role: "implementer", labPath: cwd };
      if (sessionId.includes("reviewer")) return { isLab: true, role: "reviewer", labPath: cwd };
    }
  }

  return { isLab: false };
}
