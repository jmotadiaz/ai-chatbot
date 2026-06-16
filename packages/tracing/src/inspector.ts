#!/usr/bin/env npx tsx
import { fileURLToPath } from "node:url";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import type { TraceRecord, TraceLayer } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = process.env.TRACE_DIR ?? resolve(__dirname, "../traces");

interface ResolvedRunFiles {
  isLegacy: boolean;
  dirPath?: string;
  lifecycle: string;
  stream: string;
  errors: string;
  summary?: string;
}

async function resolveRunFiles(runId: string): Promise<ResolvedRunFiles | null> {
  const runIdShort = runId.length > 8 ? runId.slice(0, 8) : runId;
  const codingAgentDir = resolve(TRACE_DIR, "coding-agent");
  
  // 1. Try new format under coding-agent
  try {
    if (existsSync(codingAgentDir)) {
      const entries = await readdir(codingAgentDir, { withFileTypes: true });
      const dirEntry = entries.find((e) => e.isDirectory() && e.name.endsWith(`_${runIdShort}`));
      if (dirEntry) {
        const dirPath = resolve(codingAgentDir, dirEntry.name);
        return {
          isLegacy: false,
          dirPath,
          lifecycle: resolve(dirPath, "lifecycle.ndjson"),
          stream: resolve(dirPath, "stream.ndjson"),
          errors: resolve(dirPath, "errors.ndjson"),
          summary: resolve(dirPath, "summary.json"),
        };
      }
    }
  } catch {}

  // 2. Try legacy format in TRACE_DIR
  const legacyPath = resolve(TRACE_DIR, `${runId}.ndjson`);
  if (existsSync(legacyPath)) {
    return {
      isLegacy: true,
      lifecycle: legacyPath,
      stream: legacyPath,
      errors: legacyPath,
    };
  }

  // 3. Try legacy format in TRACE_DIR/coding-agent
  const legacyPathCA = resolve(codingAgentDir, `${runId}.ndjson`);
  if (existsSync(legacyPathCA)) {
    return {
      isLegacy: true,
      lifecycle: legacyPathCA,
      stream: legacyPathCA,
      errors: legacyPathCA,
    };
  }

  return null;
}

async function readEvents(runId: string, segment: "lifecycle" | "stream" | "errors"): Promise<TraceRecord[]> {
  const resolved = await resolveRunFiles(runId);
  if (!resolved) throw new Error(`Run not found: ${runId}`);

  let path = resolved.lifecycle;
  if (!resolved.isLegacy) {
    if (segment === "stream") path = resolved.stream;
    if (segment === "errors") path = resolved.errors;
  }

  if (!existsSync(path)) return [];

  const content = await readFile(path, "utf-8");
  const parsed = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as TraceRecord);

  if (resolved.isLegacy) {
    if (segment === "errors") {
      return parsed.filter((e) => e.level === "error" || e.level === "warn");
    }
    if (segment === "stream") {
      return parsed.filter((e) => e.level === "debug");
    }
    if (segment === "lifecycle") {
      return parsed.filter((e) => e.level !== "debug");
    }
  }

  return parsed;
}

interface RunListEntry {
  runId: string;
  timestamp: string;
  sizeKB: number;
  isLegacy: boolean;
  status?: string;
}

async function listAllRuns(): Promise<RunListEntry[]> {
  const list: RunListEntry[] = [];
  
  // 1. Scan new format directories in coding-agent
  const codingAgentDir = resolve(TRACE_DIR, "coding-agent");
  try {
    if (existsSync(codingAgentDir)) {
      const entries = await readdir(codingAgentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const summaryPath = resolve(codingAgentDir, entry.name, "summary.json");
          const lifecyclePath = resolve(codingAgentDir, entry.name, "lifecycle.ndjson");
          const runIdShort = entry.name.split("_")[1] || entry.name;
          let runId = runIdShort;
          let status = "ok";
          let timestamp = entry.name.split("_")[0] || "";
          
          if (existsSync(summaryPath)) {
            try {
              const sumData = JSON.parse(await readFile(summaryPath, "utf8"));
              runId = sumData.runId || runId;
              status = sumData.status || status;
              if (sumData.startTime) {
                timestamp = sumData.startTime.slice(0, 19).replace("T", " ");
              }
            } catch {}
          }
          
          let size = 0;
          if (existsSync(lifecyclePath)) {
            size = (await stat(lifecyclePath)).size;
          }
          
          list.push({
            runId,
            timestamp,
            sizeKB: size / 1024,
            isLegacy: false,
            status,
          });
        }
      }
    }
  } catch {}

  // 2. Scan legacy files in TRACE_DIR
  try {
    const entries = await readdir(TRACE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".ndjson")) {
        const runId = basename(entry.name, ".ndjson");
        const s = await stat(resolve(TRACE_DIR, entry.name));
        list.push({
          runId,
          timestamp: s.mtime.toISOString().slice(0, 19).replace("T", " "),
          sizeKB: s.size / 1024,
          isLegacy: true,
        });
      }
    }
  } catch {}

  return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function formatEvent(e: TraceRecord): string {
  const ts = e.timestamp.slice(11, 23);
  const layer = e.layer.padEnd(7);
  const level = e.level.toUpperCase().padEnd(5);
  const dur = e.durationMs != null ? ` (${e.durationMs}ms)` : "";
  return `${ts} [${layer}] ${level} ${e.eventName}${dur}`;
}

const command = process.argv[2];
const argId = process.argv[3];

async function main() {
  switch (command) {
    case "list": {
      const runs = await listAllRuns();
      if (runs.length === 0) {
        console.log("No runs found in", resolve(TRACE_DIR));
        return;
      }
      console.log(`Runs in ${resolve(TRACE_DIR)}:\n`);
      for (const r of runs) {
        const typeStr = r.isLegacy ? "LEGACY" : `SEGMENTED [${r.status?.toUpperCase()}]`;
        console.log(`  ${r.runId.padEnd(36)}  ${r.sizeKB.toFixed(1).padStart(6)}KB  ${r.timestamp}  (${typeStr})`);
      }
      break;
    }
    case "show": {
      if (!argId) { console.log("Usage: inspector.ts show <runId>"); return; }
      const events = await readEvents(argId, "lifecycle");
      console.log(`Run ${argId} - Lifecycle Events (${events.length} events):\n`);
      for (const e of events) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 200)}`);
      }
      break;
    }
    case "errors": {
      if (!argId) { console.log("Usage: inspector.ts errors <runId>"); return; }
      const events = await readEvents(argId, "errors");
      console.log(`Errors/warnings in ${argId} (${events.length} events):\n`);
      for (const e of events) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 500)}`);
      }
      break;
    }
    case "stream": {
      if (!argId) { console.log("Usage: inspector.ts stream <runId>"); return; }
      const events = await readEvents(argId, "stream");
      console.log(`Stream debug events in ${argId} (${events.length} events):\n`);
      for (const e of events) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 200)}`);
      }
      break;
    }
    case "layer": {
      const wantedLayer = argId as TraceLayer;
      const runId = process.argv[4];
      if (!wantedLayer || !runId) { console.log("Usage: inspector.ts layer <worker|bridge|client> <runId>"); return; }
      const lifecycle = await readEvents(runId, "lifecycle");
      const stream = await readEvents(runId, "stream");
      const filtered = [...lifecycle, ...stream]
        .filter((e) => e.layer === wantedLayer)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      console.log(`Layer ${wantedLayer} in ${runId} (${filtered.length} events):\n`);
      for (const e of filtered) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 300)}`);
      }
      break;
    }
    case "summary": {
      if (!argId) { console.log("Usage: inspector.ts summary <runId>"); return; }
      const resolved = await resolveRunFiles(argId);
      if (!resolved) {
        console.log(`Run not found: ${argId}`);
        return;
      }
      if (!resolved.isLegacy && resolved.summary && existsSync(resolved.summary)) {
        console.log(`Summary for ${argId}:\n`);
        console.log(await readFile(resolved.summary, "utf8"));
      } else {
        console.log(`Summary for legacy run ${argId} (computed):\n`);
        const events = await readEvents(argId, "lifecycle");
        const stream = await readEvents(argId, "stream");
        const all = [...events, ...stream];
        const byLayer: Record<string, number> = {};
        const byLevel: Record<string, number> = {};
        const byEvent: Record<string, number> = {};
        let status = "ok";
        for (const e of all) {
          byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
          byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
          byEvent[e.eventName] = (byEvent[e.eventName] ?? 0) + 1;
          if (e.level === "error") status = "error";
        }
        console.log(JSON.stringify({
          runId: argId,
          status,
          counts: {
            total: all.length,
            byLayer,
            byLevel,
            byEvent
          }
        }, null, 2));
      }
      break;
    }
    case "stats": {
      if (!argId) { console.log("Usage: inspector.ts stats <runId>"); return; }
      const resolved = await resolveRunFiles(argId);
      if (!resolved) {
        console.log(`Run not found: ${argId}`);
        return;
      }
      
      let summaryData: any;
      if (!resolved.isLegacy && resolved.summary && existsSync(resolved.summary)) {
        summaryData = JSON.parse(await readFile(resolved.summary, "utf8"));
      } else {
        const events = await readEvents(argId, "lifecycle");
        const stream = await readEvents(argId, "stream");
        const all = [...events, ...stream];
        const byLayer: Record<string, number> = {};
        const byLevel: Record<string, number> = {};
        const byEvent: Record<string, number> = {};
        let totalDuration = 0;
        let maxDur = 0;
        let maxDurEvent = "";
        let startTime = "";
        let endTime = "";
        for (const e of all) {
          byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
          byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
          byEvent[e.eventName] = (byEvent[e.eventName] ?? 0) + 1;
          if (!startTime || e.timestamp < startTime) startTime = e.timestamp;
          if (!endTime || e.timestamp > endTime) endTime = e.timestamp;
          if (e.durationMs != null) {
            totalDuration += e.durationMs;
            if (e.durationMs > maxDur) { maxDur = e.durationMs; maxDurEvent = e.eventName; }
          }
        }
        const durationMs = startTime && endTime ? new Date(endTime).getTime() - new Date(startTime).getTime() : 0;
        summaryData = {
          runId: argId,
          durationMs,
          counts: {
            total: all.length,
            byLayer,
            byLevel,
            byEvent
          }
        };
      }
      
      console.log(`Stats for ${argId} (${summaryData.counts.total} events):\n`);
      console.log("By layer:");
      for (const [l, c] of Object.entries(summaryData.counts.byLayer || {})) console.log(`  ${l}: ${c}`);
      console.log("\nBy level:");
      for (const [l, c] of Object.entries(summaryData.counts.byLevel || {})) console.log(`  ${l}: ${c}`);
      if (summaryData.durationMs) {
        console.log(`\nTotal duration: ${summaryData.durationMs}ms`);
      }
      console.log("\nBy event:");
      for (const [ev, c] of Object.entries(summaryData.counts.byEvent || {}).sort((a: any, b: any) => b[1] - a[1])) {
        console.log(`  ${ev}: ${c}`);
      }
      break;
    }
    default:
      console.log("Usage: npx tsx packages/tracing/src/inspector.ts <command> [args]");
      console.log("Commands:");
      console.log("  list                          List recent trace runs");
      console.log("  summary <runId>               Show the run summary metadata");
      console.log("  show <runId>                  Show lifecycle events chronologically");
      console.log("  errors <runId>                Show only error/warn events");
      console.log("  stream <runId>                Show only debug/stream events");
      console.log("  layer <worker|bridge|client> <runId>  Show layer-specific events");
      console.log("  stats <runId>                 Event counts, durations, errors by layer");
  }
}

main().catch(console.error);
