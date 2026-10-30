import { ConfigError } from "./errors";
import { getBuildFlags } from "./facade";
import { repoPath } from "./paths";
import type { Environment, SecretsConfig } from "./types";

function getBuiltinModule(id: string): any {
  if (typeof process === "undefined") return undefined;
  const fn = (process as any)["getBuiltinModule"];
  if (typeof fn === "function") {
    try {
      return fn(id);
    } catch {}
  }
  try {
    return require(id);
  } catch {
    return undefined;
  }
}

const REQUIRED_SECRETS: { key: keyof SecretsConfig; envVar: string }[] = [
  { key: "postgresUser", envVar: "POSTGRES_USER" },
  { key: "postgresPassword", envVar: "POSTGRES_PASSWORD" },
  { key: "modelGatewayApiKey", envVar: "MODEL_GATEWAY_API_KEY" },
  { key: "authSecret", envVar: "AUTH_SECRET" },
  { key: "exaApiKey", envVar: "EXA_API_KEY" },
  { key: "context7ApiKey", envVar: "CONTEXT7_API_KEY" },
];

const VERIFY_PLACEHOLDERS: SecretsConfig = {
  postgresUser: "verify_user",
  postgresPassword: "verify_password",
  modelGatewayApiKey: "verify-gateway-key",
  authSecret: "verify_auth_secret_placeholder_at_least_32_chars_long",
  exaApiKey: "verify_exa_key",
  context7ApiKey: "ctx7sk-verify-placeholder",
};

let cachedDotenv: Record<string, string> | undefined;
let cachedSecrets: SecretsConfig | undefined;

/** Test hook: forgets cached .env content so it can be re-evaluated. */
export function resetSecretsForTests(): void {
  cachedDotenv = undefined;
  cachedSecrets = undefined;
}

function isTestRunner(): boolean {
  if (typeof process === "undefined") return false;
  const argv = (process as unknown as Record<string, unknown>)["argv"];
  if (!Array.isArray(argv)) return false;
  return argv.some((arg) => {
    const normalized = String(arg).replace(/\\/g, "/");
    return (
      /(^|\/)vitest(\.mjs|\.js)?$/.test(normalized) ||
      normalized.includes("@playwright/test") ||
      /(^|\/)playwright(\.mjs|\.js)?$/.test(normalized)
    );
  });
}

function isVerifyOrTestMode(): boolean {
  if (getBuildFlags().verifyBuild) return true;
  if (typeof process !== "undefined") {
    if (process.env?.NEXT_CLI_VERIFY === "1") return true;
    if (process.env?.NODE_ENV === "test") return true;
    if (isTestRunner()) return true;
  }
  return false;
}

function parseDotenvContent(content: string): Record<string, string> {
  const util = getBuiltinModule("node:util");
  if (util && typeof util.parseEnv === "function") {
    return util.parseEnv(content);
  }
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function loadDotenvMap(): Record<string, string> | undefined {
  if (cachedDotenv !== undefined) return cachedDotenv;
  const fs = getBuiltinModule("node:fs");
  const envPath = repoPath(".env");
  if (!fs || typeof fs.existsSync !== "function" || !fs.existsSync(envPath)) {
    return undefined;
  }
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    cachedDotenv = parseDotenvContent(content);
    return cachedDotenv;
  } catch {
    return undefined;
  }
}

/**
 * Resolves credentials from `<REPO_ROOT>/.env` in memory using `util.parseEnv`.
 * Never mutates `process.env` (ADR 0014).
 *
 * In verify / test runner execution, missing `.env` falls back to deterministic
 * verification placeholders so fresh worktrees compile and test without secrets.
 */
export function resolveDotenvSecrets(environment: Environment): SecretsConfig {
  if (cachedSecrets) return cachedSecrets;

  const map = loadDotenvMap();

  if (!map) {
    if (isVerifyOrTestMode()) {
      return VERIFY_PLACEHOLDERS;
    }
    throw new ConfigError(
      ".env",
      `Missing required .env file at ${repoPath(".env")}. ` +
        `Copy .env.example to .env and configure credentials for Environment "${environment}".`,
    );
  }

  // Check required keys
  for (const { envVar } of REQUIRED_SECRETS) {
    const val = map[envVar]?.trim();
    if (!val) {
      if (isVerifyOrTestMode()) {
        continue;
      }
      throw new ConfigError(
        envVar,
        `Missing required secret "${envVar}" in ${repoPath(".env")}. ` +
          `Required for Environment "${environment}".`,
      );
    }
  }

  const mcpApiKey =
    map["MCP_API_KEY"]?.trim() ||
    (typeof process !== "undefined" ? process.env?.MCP_API_KEY?.trim() : undefined);

  cachedSecrets = {
    postgresUser: map["POSTGRES_USER"]?.trim() || VERIFY_PLACEHOLDERS.postgresUser,
    postgresPassword: map["POSTGRES_PASSWORD"]?.trim() || VERIFY_PLACEHOLDERS.postgresPassword,
    modelGatewayApiKey: map["MODEL_GATEWAY_API_KEY"]?.trim() || VERIFY_PLACEHOLDERS.modelGatewayApiKey,
    authSecret: map["AUTH_SECRET"]?.trim() || VERIFY_PLACEHOLDERS.authSecret,
    exaApiKey: map["EXA_API_KEY"]?.trim() || VERIFY_PLACEHOLDERS.exaApiKey,
    context7ApiKey: map["CONTEXT7_API_KEY"]?.trim() || VERIFY_PLACEHOLDERS.context7ApiKey,
    ...(mcpApiKey ? { mcpApiKey } : {}),
  };

  return cachedSecrets;
}
