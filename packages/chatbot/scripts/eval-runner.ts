/**
 * Evals runner (ADR 0011, ticket 03).
 *
 * The old "evals mode" (`NEXT_PUBLIC_ENV=evals` + `.env.evals` + an overrides block
 * in `process.env`) no longer exists: configuration is a frozen TypeScript bundle
 * per Environment and `process.env` is not a configuration channel. The runner now
 * requires an EXPLICIT `--env=dev|test|prod` in its `process.argv` and forwards it
 * via argv (never via env) to every child it
 * spawns: `scripts/next-cli.ts dev` and `lib/infrastructure/db/migrate.ts`.
 *
 * Operational note about the evals Environment (open point, ticket 04):
 * the cases run INSIDE evalite's process (`createVitest`), which
 * loads `vitest.config.ts` — initialised with `initConfig("test")` — so
 * in-process cases always run against test's bundle (Mock Gateway
 * `:4001`, DB `:5434/test`), while the evaluated server is whichever you
 * start with `--env=...`. An eval that needs the REAL Gateway (`:4000`) with
 * the isolated test DB has no Environment representing it today: that is a
 * design decision (e.g. an `evals` Environment or an explicit flag) and is left
 * out of this ticket.
 */
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
import {
  config,
  initConfig,
  optional,
  parseEnvironmentFromArgv,
  type Environment,
} from "config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, "..");
// The compose files live at the repo root (`packages/chatbot` is two levels down).
const REPO_ROOT = resolve(PROJECT_ROOT, "../..");
const TEST_COMPOSE_FILE = resolve(REPO_ROOT, "docker-compose.test.yml");
const LOCK_PATH = resolve(PROJECT_ROOT, "tests/evals/.runner.lock");

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

function prepareEvalEnv(port: number): void {
  // Only what is HARNESS for evals (not app configuration): the cases
  // (`tests/evals/cases/*.eval.ts`) read EVAL_BASE_URL to call the server.
  // Everything else this runner used to inject (POSTGRES_URL,
  // AUTH_SECRET, NEXT_PUBLIC_ENV=evals, TRACE_*, DISABLE_DEV_INDICATOR, …)
  // was configuration via process.env, forbidden by ADR 0011: today all of that
  // is provided by the bundle of the Environment chosen with `--env=...`.
  Object.assign(process.env, {
    EVAL_BASE_URL: `http://localhost:${port}`,
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

function spawnNextDev(port: number, environment: Environment): ChildProcess {
  // The evaluated server goes through the micro-launcher (ADR 0011): the Environment
  // travels in the child's process.argv, never via process.env. Without `--webpack`
  // (same as the old `next dev --turbo`): Turbopack.
  const args = [
    "tsx",
    "scripts/next-cli.ts",
    "dev",
    `--env=${environment}`,
    `--port=${port}`,
  ];
  console.log(`[next] starting npx ${args.join(" ")} ...`);
  const child = spawn("npx", args, {
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
  // evalite runs the cases INSIDE its own process (`createVitest`),
  // which loads `vitest.config.ts` — initialised with `initConfig("test")` — and
  // aliases `"config"` to test's bundle. There is no way to inject argv into it through
  // this spawn: that is the open point documented in the header of this
  // file (in-process cases run in the test Environment even when the evaluated
  // server runs with another `--env`).
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
  const FORBIDDEN_PORTS = new Set([8085, 3015, 5435]);
  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(`ensurePortFreed: port ${port} belongs to production and cannot be killed`);
  }
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

  // EXPLICIT Environment via process.argv (replaces the old
  // `NEXT_PUBLIC_ENV=evals`): without `--env` it does not start (ADR 0011).
  const environment = parseEnvironmentFromArgv(process.argv);
  if (!environment) {
    console.error(
      [
        "❌ eval-runner requires --env=dev|test|prod (ADR 0011; the old evals",
        "mode via NEXT_PUBLIC_ENV no longer exists). E.g.: npx tsx scripts/eval-runner.ts --env=test -c <case>",
      ].join("\n"),
    );
    process.exit(1);
  }
  initConfig(environment);

  const runId = randomUUID();
  prepareEvalEnv(opts.port);

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
  console.log(`environment:     ${environment}`);
  console.log(`runId:       ${runId}`);
  console.log(`port:        ${opts.port}`);
  console.log(`POSTGRES_URL: ${optional(() => config.postgresUrl()) ?? "undefined"}`);
  console.log(`TRACE_DIR:   ${config.traceDir() ?? "undefined"}`);
  console.log(`EVAL_BASE_URL: ${process.env.EVAL_BASE_URL ?? "undefined"}\n`);

  let exitCode = 0;

  try {
    // The isolated test DB (compose `docker-compose.test.yml`, 5434) only
    // applies when the chosen Environment IS test: with any other Environment, each one
    // migrates its own DB (ADR 0001/0011) and this runner does not touch compose.
    const usesTestCompose = environment === "test";
    if (!opts.noDb && usesTestCompose) {
      console.log("[db] starting test database...");
      runDbCmd(["-f", TEST_COMPOSE_FILE, "up", "--wait"]);
    }
    if (!opts.noMigrate) {
      console.log(`[db] running migrations (${environment})...`);
      execSync(`npx tsx lib/infrastructure/db/migrate.ts --env=${environment}`, {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
      });
    }

    if (!opts.noServer) {
      next = spawnNextDev(opts.port, environment);
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
    if (!opts.keepDb && !opts.noDb && environment === "test") {
      try {
        console.log("[db] stopping test database...");
        runDbCmd(["-f", TEST_COMPOSE_FILE, "down"]);
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
