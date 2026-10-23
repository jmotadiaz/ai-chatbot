import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Contrato de fronteras de lint (ticket 05, spec ADR 0010). El `eslint.config.mjs`
 * del chatbot publique dos reglas de frontera que son parte de la API del paquete:
 *
 *  1. Ningún fichero con directiva `"use client"` puede importar
 *     `@/lib/infrastructure/ai` (exacto o cualquier subpath, p. ej.
 *     `@/lib/infrastructure/ai/inference-kit`): es el composition root del Model
 *     Gateway, server-only de hecho.
 *  2. Ningún fichero FUERA de `lib/infrastructure/ai/` puede importar `@ai-sdk/*`,
 *     salvo `@ai-sdk/react` (UI, no transporte de IA).
 *
 * Se ejecutan versiones sintéticas de ficheros reales a través del ESLint
 * programático con el config plano real del paquete, así el contrato rompe si
 * alguien relaja o renombra las reglas sin pasar por aquí.
 */

const PACKAGE_ROOT = path.resolve(__dirname, "../..");

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

describe("fronteras de lint del chatbot (eslint.config.mjs)", () => {
  it("un use client no puede importar el composition root (exact ni subpath)", async () => {
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
  });

  it("un server file SÍ puede importar el composition root", async () => {
    const ruleIds = await lint(
      "lib/features/chat/actions.ts",
      serverFile(`import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";`),
    );
    expect(ruleIds).not.toContain("local/no-inference-in-client-components");
  });

  it("sin use client no aplica la regla local aunque el import sea el mismo", async () => {
    const ruleIds = await lint(
      "components/chat/message.tsx",
      serverFile(`import type { CreateAgentOptions } from "@/lib/infrastructure/ai";`),
    );
    expect(ruleIds).not.toContain("local/no-inference-in-client-components");
  });

  it("@ai-sdk/* fuera de lib/infrastructure/ai está prohibido (wildcard y vendor)", async () => {
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

  it("@ai-sdk/react queda permitido fuera de infra (es UI)", async () => {
    const ruleIds = await lint(
      "lib/features/chat/conversation/hooks/use-chat.ts",
      serverFile(`import type { UseChatHelpers } from "@ai-sdk/react";`),
    );
    expect(ruleIds).not.toContain("no-restricted-imports");
  });

  it("los tipos de protocolo V3 consumibles desde el composition root, no desde @ai-sdk/provider", async () => {
    const ruleIds = await lint(
      "tests/helpers/stream-chunks.ts",
      serverFile(`import type { LanguageModelV3StreamPart } from "@/lib/infrastructure/ai/types";`),
    );
    expect(ruleIds).not.toContain("no-restricted-imports");

    const forbidden = await lint(
      "tests/helpers/stream-chunks.ts",
      serverFile(`import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";`),
    );
    expect(forbidden).toContain("no-restricted-imports");
  });

  it("dentro de lib/infrastructure/ai los transportes @ai-sdk/openai-* son los permitidos", async () => {
    const ruleIds = await lint(
      "lib/infrastructure/ai/inference-kit.ts",
      serverFile(
        `import { createOpenAICompatible } from "@ai-sdk/openai-compatible";\nimport { createOpenAI } from "@ai-sdk/openai";\nimport type { LanguageModelV3 } from "@ai-sdk/provider";`,
      ),
    );
    expect(ruleIds).not.toContain("no-restricted-imports");
  });
});
