# Spec: Lookup directo de transcripciones en `loadSessionFromDisk`

**Status:** ready-for-agent

## Problem Statement

Abrir un chat de código y el primer prompt tardan ~1.3 s extra por cada búsqueda de sesión en
disco. `loadSessionFromDisk` (`packages/coding-agent/src/session/session-registry.ts:93`) llama a
`SessionManager.list(listDir)` del SDK de Pi, que lee y parsea **todas** las transcripciones
`.jsonl` del directorio (medido: 383 ficheros, 145 MB, **1302 ms**) solo para encontrar una.

En una sesión nueva (fila en DB, sin fichero) el SSR (`packages/chatbot/lib/features/code/session-bootstrap.ts:131,140,154`)
dispara tres búsquedas concurrentes (snapshot, model, thinking level) y `initializeSession` una
cuarta antes de empezar a emitir.

## Solution

Localizar el fichero por nombre (`readdir` + match `*_${sessionId}.jsonl` / `${sessionId}.jsonl`,
medido ~1 ms) y abrirlo directamente con `SessionManager.open(filePath)`; si no existe, devolver
`undefined` sin escanear contenido.

## Issues

- `issues/01-lookup-directo-por-nombre.md`

## Out of scope (posibles follow-ups)

- Cache negativa de "sesión sin fichero" para evitar búsquedas repetidas concurrentes.
- Eliminar el waterfall `fetchSnapshot` → `Promise.all` en `session-bootstrap.ts:131-135` (~20 ms).
- Coste de creación de sesión Pi (~75 ms: skills/AGENTS.md, extensiones jiti).
