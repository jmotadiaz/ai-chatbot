# 08: Verificación final sin rastros

**What to build:** Comprobación de extremo a extremo de que no queda ningún rastro de la purga: el catálogo resultante es el especificado, ningún fichero activo referencia lo eliminado, y las suites y la compilación aislada están en verde. Es la única verificación de ausencia de todo el esfuerzo.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 09.

**Status:** resolved

- [x] Un grep determinista sobre el repo no encuentra referencias al término eliminado en código, configuración ni documentación activa, excluyendo el propio esfuerzo (`.scratch/purga-skills/`), la salida generada (artefactos) y las trazas históricas.
- [x] El catálogo de operador tiene 29 skills y ninguna de las 11 bajas está presente.
- [x] Suites rápidas del repo en verde (`verify:fast`).
- [x] Verificación de compilación aislada en verde (`build:verify`), nunca el build de producción.
- [x] El chequeo de ausencia ha sido efímero: no se ha añadido ningún test permanente que lo codifique.

## Verification

Ejecutada el 2026-09-11 en el worktree `.worktrees/08-verificacion` (rama `purga-08-verificacion`, base `d966f42`). Chequeo efímero: no se añadió ningún test, aserción, gate de grep ni check de CI que codifique la ausencia. `spec.md` queda intacto.

### 1. Grep determinista de ausencia (solo ficheros trackeados)

Exclusiones por pathspec en los tres greps: `.scratch/purga-skills/**` (el propio esfuerzo), `docs/archive/**` (documentos históricos archivados; el spec renombra el directorio precisamente para conservarlos), y salida generada: `packages/tracing/traces/**`, `tests/evals/traces/**`, `.pi*/**`, `dist/**`, `.next*/**`, `coverage/**`, `node_modules/**`, `.worktrees/**`.

```
$ git grep -n -i "superpowers" -- . <exclusiones>
(sin salida, exit 1)

$ git grep -n "docs/superpowers" -- . <exclusiones>
(sin salida, exit 1)

$ grep -n -i "ctx7\|context7" AGENTS.md
(sin salida, exit 1)

$ grep -rn "to-questionnaire" .agents/skills/
(sin salida, exit 1)

$ git grep -n -E "git-guardrails-claude-code|setup-pre-commit|migrate-to-shoehorn|scaffold-exercises|claude-handoff|loop-me|setup-ts-deep-modules|to-questionnaire|writing-beats|writing-fragments|writing-shape" -- . ':(exclude).scratch/**' ':(exclude)docs/archive/**' <resto de exclusiones>
(sin salida, exit 1)
```

El `git grep -i "superpowers"` sin exclusiones da 47 líneas, todas dentro de los dos ámbitos excluidos: `.scratch/purga-skills/**` (el esfuerzo) y `docs/archive/**` (planes/specs históricos, cuyo contenido conserva el espacio de nombres antiguo a propósito). Cero hits en código, configuración o documentación activa: no hubo nada que corregir.

### 2. Invariantes del catálogo

| Comprobación | Resultado |
| --- | --- |
| `ls .agents/skills \| wc -l` | 29 |
| ninguno de los 11 directorios dados de baja existe | OK |
| `set(skills-lock.json['skills']) == set(.agents/skills) - {'find-docs','trace-analyzer'}` | OK (27 == 27; sin claves huérfanas) |
| `test ! -d .superpowers` | OK (ausente) |
| `opencode.json` sin clave `plugin` | OK |
| `.gitignore` (raíz y chatbot) sin `.superpowers` | OK |
| `.agents/skills/prototype/LOGIC.md` referencia `publish_artifact` y `mobile-first-artifacts` | OK (líneas 37 y 54) |
| `packages/coding-agent/extensions/` | `artifacts`, `subagent` |
| `packages/coding-agent/skills/` | `mobile-first-artifacts`, `writing-prompties` |

### 3. Suites rápidas

```
$ pnpm verify:fast   # lint + type:check + test:unit + test:component + test:integration + test:contract
EXIT 0
Test Files  3 passed (3)    Tests  52 passed (52)   packages/models test:unit
Test Files  6 passed (6)    Tests  35 passed (35)   packages/config test:unit
Test Files 19 passed (19)   Tests 217 passed (217)  packages/coding-agent test:unit
Test Files 39 passed (39)   Tests 245 passed (245)  packages/chatbot test:unit
Test Files 36 passed (36)   Tests 181 passed (181)  packages/chatbot test:component
Test Files  8 passed (8)    Tests  39 passed (39)   packages/coding-agent test:integration
Test Files  7 passed (7)    Tests  36 passed (36)   packages/chatbot test:integration
Test Files  8 passed (8)    Tests  59 passed (59)   packages/coding-agent test:contract
Test Files  3 passed (3)    Tests  12 passed (12)   packages/chatbot test:contract
```

### 4. Compilación aislada

```
$ pnpm build:verify
EXIT 0
packages/coding-agent build:verify: models.json written to .../packages/coding-agent/.pi-verify/models.json
packages/coding-agent build:verify: Done
packages/chatbot build:verify: ✓ Compiled successfully in 28.2s
packages/chatbot build:verify:   Running TypeScript ...
packages/chatbot build:verify: ✓ Generating static pages (29/29)
packages/chatbot build:verify: Done
```

Se usaron solo directorios aislados (`.next/verify` + `dist/verify` + `.pi-verify`); nunca `build` de producción, ni `pm2`, ni `preview`.

### 5. Notas de entorno (worktree, no del código)

- Los `node_modules` del worktree son symlinks al checkout principal (documentado en las notas de reconocimiento). Turbopack rechaza symlinks que apuntan fuera de su `root` (`turbopack.root = path.join(__dirname, "../..")`), así que el primer `build:verify` en el worktree falla con `Symlink packages/chatbot/node_modules is invalid, it points out of the filesystem root`. Para poder ejecutar el comando canónico, los seis symlinks se sustituyeron temporalmente por copias reales dentro del worktree, `build:verify` pasó, y después se restauraron los symlinks y se borraron los directorios de salida aislados. Ningún fichero trackeado cambió. Con el heap por defecto (~2 GB) la build además moría por OOM; el run verde usó `NODE_OPTIONS=--max-old-space-size=4096`.
- Aviso operativo: el script canónico `build:verify` ejecuta `dotenv -o -e ../../.env.prod -- tsx lib/infrastructure/db/migrate.ts`. En el worktree no existe `.env.prod`, así que dotenv no carga nada y `DATABASE_URL` del entorno (`localhost:5435/prod`) pasa tal cual: las migraciones (idempotentes, todas "already exists, skipping") corren contra la DB de producción. La purga no incluye ninguna migración, así que no hubo cambio de schema, pero conviene saberlo.
