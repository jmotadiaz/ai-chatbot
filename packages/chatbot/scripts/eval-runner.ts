import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn, execSync, type ChildProcess } from "child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { randomUUID } from "crypto";
import { config as dotenv } from "dotenv";
import { config, optional } from "config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, "..");
const TEST_DB_URL = "postgres://postgres:postgres@127.0.0.1:5434/test";
const LOCK_PATH = resolve(PROJECT_ROOT, "tests/evals/.runner.lock");
const TRACES_DIR = resolve(PROJECT_ROOT, "tests/evals/traces");

function parseArgs(): {
  caseName?: string;
  noDb: boolean;
  keepDb: boolean;
  noMigrate: boolean;
  noServer: boolean;
  port: number;
} {
  const args = process.argv.slice(2);
  const caseIdx = args.indexOf("-c");
  const portIdx = args.indexOf("--port");
  const portArg = portIdx >= 0 ? Number(args[portIdx + 1]) : NaN;
  return {
    caseName: caseIdx >= 0 ? args[caseIdx + 1] : undefined,
    noDb: args.includes("--no-db"),
    keepDb: args.includes("--keep-db"),
    noMigrate: args.includes("--no-migrate"),
    noServer: args.includes("--no-server"),
    port: Number.isFinite(portArg) ? portArg : 3000,
  };
}

function loadEnv(runId: string, port: number): void {
  dotenv({
    path: resolve(PROJECT_ROOT, ".env.development.local"),
    override: false,
  });
  Object.assign(process.env, {
    POSTGRES_URL: TEST_DB_URL,
    POSTGRES_PRISMA_URL: TEST_DB_URL,
    POSTGRES_URL_NON_POOLING: TEST_DB_URL,
    DATABASE_URL: TEST_DB_URL,
    AUTH_SECRET: "test_secret",
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_ENV: "evals",
    PRIVATE_BEHAVIOR: "enabled",
    DISABLE_DEV_INDICATOR: "1",
    DEFAULT_CONTEXT_WINDOW: "20000",

    TRACE_ENABLED: "1",
    TRACE_RUN_ID: runId,
    TRACE_DIR: TRACES_DIR,

    EVAL_BASE_URL: `http://localhost:${port}`,
    PORT: String(port),
    NODE_ENV: "development",
  });
}

function acquireLock(): boolean {
  if (existsSync(LOCK_PATH)) {
    try {
      const pid = Number(readFileSync(LOCK_PATH, "utf8").trim());
      if (Number.isFinite(pid) && pid > 0 && process.kill(pid, 0)) {
        console.error(`Another eval runner is active (pid ${pid}).`);
        return false;
      }
    } catch {
      // stale lock
    }
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      /* ignore */
    }
  }
  writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

function checkPortAvailable(port: number): boolean {
  try {
    const pids = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    }).trim();
    if (!pids) return true;
    console.error(`\nError: port ${port} is already in use by pid(s): ${pids}`);
    console.error(`\nKill them with:\n  kill ${pids.split("\n").join(" ")}\n`);
    return false;
  } catch {
    return true;
  }
}

async function waitForHttp(
  url: string,
  { timeoutMs = 120_000, intervalMs = 500 } = {},
): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timeout waiting for ${url} after ${timeoutMs}ms (last: ${lastErr})`,
  );
}

function spawnNextDev(port: number): ChildProcess {
  console.log(`[next] starting npx next dev --turbo -p ${port} ...`);
  const child = spawn("npx", ["next", "dev", "--turbo", "-p", String(port)], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // new process group so we can kill the whole tree
  });
  const prefix = (s: string) => `[next] ${s}`;
  child.stdout?.on("data", (d) => process.stdout.write(prefix(String(d))));
  child.stderr?.on("data", (d) => process.stderr.write(prefix(String(d))));
  child.on("error", (err) => console.error("[next] error:", err));
  return child;
}

function spawnEvalite(targetPath: string): ChildProcess {
  const cmd = `npx evalite run ${targetPath}`;
  console.log(`[evalite] ${cmd}`);
  const child = spawn(cmd, {
    cwd: PROJECT_ROOT,
    env: process.env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = (s: string) => `[evalite] ${s}`;
  child.stdout?.on("data", (d) => process.stdout.write(prefix(String(d))));
  child.stderr?.on("data", (d) => process.stderr.write(prefix(String(d))));
  child.on("error", (err) => console.error("[evalite] error:", err));
  return child;
}

function killChild(
  child: ChildProcess | undefined,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (!child || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    if (!child.pid) {
      resolve();
      return;
    }
    const pid = child.pid;
    const onExit = () => {
      child.off("exit", onExit);
      resolve();
    };
    child.once("exit", onExit);
    try {
      // Kill the whole process group so npx + next both die
      child.kill(signal);
      process.kill(-pid, signal);
    } catch {
      resolve();
    }
    setTimeout(() => {
      if (!child.killed) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 5_000).unref();
  });
}

async function ensurePortFreed(
  port: number,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const pids = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
      }).trim();
      if (!pids) return;
      // Port still occupied — force-kill remaining processes
      try {
        execSync(`kill -9 ${pids.split("\n").join(" ")}`, {
          cwd: PROJECT_ROOT,
          encoding: "utf8",
        });
      } catch {
        /* ignore */
      }
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function runDbCmd(args: string[]): void {
  execSync(`docker compose ${args.join(" ")}`, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
}

function resolveCasePath(caseName: string | undefined): string {
  const evalsDir = resolve(PROJECT_ROOT, "tests/evals/cases");
  if (!caseName) return evalsDir;
  const fileName = caseName.endsWith(".eval.ts")
    ? caseName
    : `${caseName}.eval.ts`;
  const targetPath = resolve(evalsDir, fileName);
  if (!existsSync(targetPath)) {
    console.error(`Eval case not found: ${targetPath}`);
    console.error(`Available cases:`);
    const files = readdirSync(evalsDir).filter((f) => f.endsWith(".eval.ts"));
    files.forEach((f) => console.error(`  - ${f.replace(".eval.ts", "")}`));
    process.exit(1);
  }
  return targetPath;
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const runId = randomUUID();
  loadEnv(runId, opts.port);

  if (!acquireLock()) process.exit(1);
  process.on("exit", () => releaseLock());

  if (!opts.noServer && !checkPortAvailable(opts.port)) {
    process.exit(1);
  }

  let next: ChildProcess | undefined;
  const cleanup = () => {
    killChild(next); // fire-and-forget; will force-kill after 5s if needed
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  console.log(`\n=== eval-runner ===`);
  console.log(`runId:       ${runId}`);
  console.log(`port:        ${opts.port}`);
  console.log(`POSTGRES_URL: ${optional(() => config.postgresUrl()) ?? "undefined"}`);
  console.log(`TRACE_DIR:   ${config.traceDir() ?? "undefined"}`);
  console.log(`EVAL_BASE_URL: ${config.evalBaseUrl() ?? "undefined"}\n`);

  let exitCode = 0;

  try {
    if (!opts.noDb) {
      console.log("[db] starting test database...");
      runDbCmd(["-f", "docker-compose.test.yml", "up", "--wait"]);
    }
    if (!opts.noMigrate) {
      console.log("[db] running migrations...");
      execSync("npx tsx lib/infrastructure/db/migrate.ts", {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
      });
    }

    if (!opts.noServer) {
      next = spawnNextDev(opts.port);
      await waitForHttp(`http://localhost:${opts.port}`, {
        timeoutMs: 120_000,
      });
      console.log(`[next] ready at http://localhost:${opts.port}`);
    }

    const targetPath = resolveCasePath(opts.caseName);
    const evalite = spawnEvalite(targetPath);

    const forward = (signal: NodeJS.Signals) => {
      if (!evalite.killed) {
        try {
          evalite.kill(signal);
        } catch {
          /* ignore */
        }
      }
    };
    process.on("SIGINT", () => forward("SIGINT"));
    process.on("SIGTERM", () => forward("SIGTERM"));

    exitCode = await new Promise<number>((resolve) => {
      evalite.on("exit", (code) => resolve(code ?? 0));
    });
  } catch (err) {
    console.error("eval-runner error:", err);
    exitCode = 1;
  } finally {
    await killChild(next);
    if (!opts.noServer) {
      await ensurePortFreed(opts.port);
    }
    if (!opts.keepDb && !opts.noDb) {
      try {
        console.log("[db] stopping test database...");
        runDbCmd(["-f", "docker-compose.test.yml", "down"]);
      } catch (err) {
        console.error("[db] failed to stop:", err);
      }
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
