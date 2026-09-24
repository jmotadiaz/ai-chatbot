# 07: Contract — borrado de los reexports, regla de lint y evals vía kit

**What to build:** el chatbot importa el kit únicamente a través de su módulo de composición raíz; los reexports transitorios (`languageModelConfigurations`, `providers` en infraestructura) han desaparecido junto con la feature `foundation-model` en su forma actual (la configuración isomorfa para la UI se conserva). El lint impide importar el kit desde componentes de cliente y importar SDKs de proveedor fuera del paquete. El simulador de evals resuelve modelos a través del kit.

**Blocked by:** 03, 04, 05, 06 (todas las migraciones de consumidores).

**Status:** ready-for-agent

- [ ] Borrados los reexports de `languageModelConfigurations` y `providers`; todas las features importan la instancia raíz. La configuración de modelos para la UI (ids invocables, capacidades por modelo, default) permanece en un módulo isomorfo que solo depende de `models`.
- [ ] Regla `no-restricted-imports` en el lint del chatbot: los ficheros con `"use client"` no importan `inference` ni el módulo de composición raíz; fuera de `packages/inference` nadie importa `@ai-sdk/*` de proveedor, `@openrouter/ai-sdk-provider` ni `@openrouter/sdk` (`ai`, `@ai-sdk/react` y `@ai-sdk/provider` siguen permitidos). Las dependencias de proveedor se retiran del `package.json` del chatbot.
- [ ] El simulador de evals y los scorers que hoy llaman a proveedores directamente resuelven por id o rol a través del kit; ningún id de proveedor (`provider/model`) queda en los evals.
- [ ] README del paquete: responsabilidad (fachada fina, no anticorrupción), regla de dependencia (cliente y Pi solo ven `models`), supuestos de runtime Node, cómo añadir un endpoint kind, un rol o un comportamiento de mock.
- [ ] `AGENTS.md` raíz: `inference` en la estructura del monorepo y en el grafo de dependencias; nota de que el worker puede consumirlo pero no lo hace todavía.
- [ ] `pnpm verify:fast`, `pnpm test:e2e` y `pnpm build:verify` en verde; arranque comprobado con `pnpm dev`. Sin tocar pm2 ni `build`.

## Comments
