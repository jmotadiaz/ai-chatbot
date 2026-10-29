import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Lint boundary contract (ticket 05, ADR 0010 spec). The chatbot's
 * `eslint.config.mjs` publishes two boundary rules that are part of the package
 * API:
 *
 *  1. No file with the `"use client"` directive may import
 *     `@/lib/infrastructure/ai` (exact or any subpath, e.g.
 *     `@/lib/infrastructure/ai/inference-kit`): it is the Model Gateway's
 *     composition root, effectively server-only.
 *  2. No file OUTSIDE `lib/infrastructure/ai/` may import `@ai-sdk/*`, except
 *     `@ai-sdk/react` (UI, not AI transport).
 *
 * Synthetic versions of real files are run through the programmatic ESLint with
 * the package's real flat config, so the contract breaks if someone relaxes or
 * renames the rules without passing through here.
 */

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");

const eslint = new ESLint({
  cwd: PACKAGE_ROOT,
  overrideConfigFile: path.join(PACKAGE_ROOT, "eslint.config.mjs"),
});

async function lint(virtualPath: string, code: string) {
  const results = await eslint.lintText(code, { filePath: path.join(PACKAGE_ROOT, virtualPath) });
  return results[0].messages.map((m) => m.ruleId ?? "").filter(Boolean);
}

const useClient = (imports: string) =>
  `"use client";\nimport { useState } from "react";\n${imports}\nexport default function C() { return null; }\n`;

const serverFile = (imports: string) =>
  `${imports}\nexport default function S() { return null; }\n`;

describe("chatbot lint boundaries (eslint.config.mjs)", () => {
  // This case lints three snippets sequentially through a programmatic ESLint
  // instance built from the real flat config; ESLint startup dominates, so it
  // can cross Vitest's default 5s timeout when `vitest related` runs many
  // files in parallel on a loaded machine (flake documented in the migration
  // commit 62c837f6). Bumped to 15s to absorb that load spike.
  it("a use client file cannot import the composition root (exact nor subpath)", async () => {
    const ruleIds = await lint(
      "lib/features/chat/hooks/use-chat.tsx",
      useClient(`import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";`),
    );
    expect(ruleIds).toContain("local/no-inference-in-client-components");

    const exactRoot = await lint(
      "lib/features/attachment/picker.tsx",
      useClient(`import type { EmbeddingTaskType } from "@/lib/infrastructure/ai";`),
    );
    expect(exactRoot).toContain("local/no-inference-in-client-components");

    const configImport = await lint(
      "components/chat/model-picker.tsx",
      useClient(`import { config } from "config";`),
    );
    expect(configImport).toContain("local/no-inference-in-client-components");
  }, 15_000);

  it("a server file CAN import the composition root", async () => {
    const ruleIds = await lint(
      "lib/features/chat/actions.ts",
      serverFile(`import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";`),
    );
    expect(ruleIds).not.toContain("local/no-inference-in-client-components");
  });

  it("without use client the local rule does not apply even if the import is the same", async () => {
    const ruleIds = await lint(
      "components/chat/message.tsx",
      serverFile(`import type { CreateAgentOptions } from "@/lib/infrastructure/ai";`),
    );
    expect(ruleIds).not.toContain("local/no-inference-in-client-components");
  });

  it("@ai-sdk/* outside lib/infrastructure/ai is forbidden (wildcard and vendor)", async () => {
    const wildcard = await lint(
      "lib/features/english/actions.ts",
      serverFile(`import type { SpeechModelV3 } from "@ai-sdk/amazon-bedrock";`),
    );
    expect(wildcard).toContain("no-restricted-imports");

    const vendor = await lint(
      "lib/features/chat/title.ts",
      serverFile(`import { createOpenAI } from "@ai-sdk/google";`),
    );
    expect(vendor).toContain("no-restricted-imports");
  });

  it("@ai-sdk/react stays allowed outside infra (it is UI)", async () => {
    const ruleIds = await lint(
      "lib/features/chat/conversation/hooks/use-chat.ts",
      serverFile(`import type { UseChatHelpers } from "@ai-sdk/react";`),
    );
    expect(ruleIds).not.toContain("no-restricted-imports");
  });

  it("V3 protocol types are consumable from the composition root, not from @ai-sdk/provider", async () => {
    // `tests/unit/infrastructure/gateway-image-model.test.ts` is a real consumer:
    // it types the transport's call options from the composition root.
    const ruleIds = await lint(
      "tests/unit/infrastructure/gateway-image-model.test.ts",
      serverFile(`import type { LanguageModelV3CallOptions } from "@/lib/infrastructure/ai/types";`),
    );
    expect(ruleIds).not.toContain("no-restricted-imports");

    const forbidden = await lint(
      "tests/unit/infrastructure/gateway-image-model.test.ts",
      serverFile(`import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";`),
    );
    expect(forbidden).toContain("no-restricted-imports");
  });

  it("inside lib/infrastructure/ai the @ai-sdk/openai-* transports are the allowed ones", async () => {
    const ruleIds = await lint(
      "lib/infrastructure/ai/inference-kit.ts",
      serverFile(
        `import { createOpenAICompatible } from "@ai-sdk/openai-compatible";\nimport { createOpenAI } from "@ai-sdk/openai";\nimport type { LanguageModelV3 } from "@ai-sdk/provider";`,
      ),
    );
    expect(ruleIds).not.toContain("no-restricted-imports");
  });
});
