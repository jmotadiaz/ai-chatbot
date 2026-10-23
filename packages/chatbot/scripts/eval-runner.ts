/**
 * Runner de evals (ADR 0011, ticket 03).
 *
 * El antiguo "modo evals" (`NEXT_PUBLIC_ENV=evals` + `.env.evals` + un bloque
 * de overrides en `process.env`) ya no existe: la configuración es un bundle
 * TypeScript congelado por Entorno y `process.env` no es un canal de
 * configuración. El runner exige ahora un `--env=dev|test|prod` EXPLÍCITO en
 * su `process.argv` y se lo reenvía por argv (nunca por env) a cada hijo que
 * lanza: `scripts/next-cli.ts dev` y `lib/infrastructure/db/migrate.ts`.
 *
 * Nota operativa sobre el Entorno de los evals (punto abierto, ticket 04):
 * los casos se ejecutan DENTRO del proceso de evalite (`createVitest`), que
 * carga `vitest.config.ts` — inicializado con `initConfig("test")` — así que
 * los casos en proceso corren siempre sobre el bundle de test (Mock Gateway
 * `:4001`, DB `:5434/test`), mientras que el servidor evaluado es el que tú
 * lances con `--env=...`. Un eval que necesite el Gateway REAL (`:4000`) con
 * la DB de test aislada no tiene hoy un Entorno que lo represente: eso es una
 * decisión de diseño (p. ej. un Entorno `evals` o un flag explícito) y queda
 * fuera de este ticket.
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
  parseEntornoFromArgv,
  type Entorno,
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
  // Solo lo que es HARNESS de evals (no configuración de la app): los casos
  // (`tests/evals/cases/*.eval.ts`) leen EVAL_BASE_URL para llamar al server.
  // El resto de lo que este runner inyectaba antes (POSTGRES_URL,
  // AUTH_SECRET, NEXT_PUBLIC_ENV=evals, TRACE_*, DISABLE_DEV_INDICATOR, …)
  // era configuración vía process.env, prohibida por ADR 0011: hoy todo eso
  // lo aporta el bundle del Entorno elegido con `--env=...`.
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

function spawnNextDev(port: number, entorno: Entorno): ChildProcess {
  // El servidor evaluado pasa por el micro-launcher (ADR 0011): el Entorno
  // viaja por process.argv del hijo, nunca por process.env. Sin `--webpack`
  // (igual que el antiguo `next dev --turbo`): Turbopack.
  const args = [
    "tsx",
    "scripts/next-cli.ts",
    "dev",
    `--env=${entorno}`,
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
  // evalite ejecuta los casos DENTRO de su propio proceso (`createVitest`),
  // que carga `vitest.config.ts` — inicializado con `initConfig("test")` — y
  // aliasa `"config"` al bundle de test. No hay forma de inyectarle argv por
  // este spawn: ese es el punto abierto documentado en la cabecera de este
  // fichero (los casos en proceso corren en Entorno test aunque el server
  // evaluado corra con otro `--env`).
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

  // Entorno EXPLÍTITO por process.argv (sustituye al viejo
  // `NEXT_PUBLIC_ENV=evals`): sin `--env` no se arranca (ADR 0011).
  const entorno = parseEntornoFromArgv(process.argv);
  if (!entorno) {
    console.error(
      [
        "❌ eval-runner exige --env=dev|test|prod (ADR 0011; el antiguo modo",
        "evals por NEXT_PUBLIC_ENV ya no existe). Ej: npx tsx scripts/eval-runner.ts --env=test -c <caso>",
      ].join("\n"),
    );
    process.exit(1);
  }
  initConfig(entorno);

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
  console.log(`entorno:     ${entorno}`);
  console.log(`runId:       ${runId}`);
  console.log(`port:        ${opts.port}`);
  console.log(`POSTGRES_URL: ${optional(() => config.postgresUrl()) ?? "undefined"}`);
  console.log(`TRACE_DIR:   ${config.traceDir() ?? "undefined"}`);
  console.log(`EVAL_BASE_URL: ${process.env.EVAL_BASE_URL ?? "undefined"}\n`);

  let exitCode = 0;

  try {
    // La DB aislada de test (compose `docker-compose.test.yml`, 5434) solo
    // aplica cuando el Entorno elegido ES test: con otro Entorno, cada uno
    // migra su propia DB (ADR 0001/0011) y este runner no toca compose.
    const usesTestCompose = entorno === "test";
    if (!opts.noDb && usesTestCompose) {
      console.log("[db] starting test database...");
      runDbCmd(["-f", TEST_COMPOSE_FILE, "up", "--wait"]);
    }
    if (!opts.noMigrate) {
      console.log(`[db] running migrations (${entorno})...`);
      execSync(`npx tsx lib/infrastructure/db/migrate.ts --env=${entorno}`, {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
      });
    }

    if (!opts.noServer) {
      next = spawnNextDev(opts.port, entorno);
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
    if (!opts.keepDb && !opts.noDb && entorno === "test") {
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
