#!/usr/bin/env npx tsx
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, basename } from "node:path";
import type { TraceRecord, TraceLayer } from "./types";

const TRACE_DIR = process.env.TRACE_DIR ?? "traces";

async function listTraceFiles(): Promise<string[]> {
  try {
    const entries = await readdir(TRACE_DIR);
    return entries
      .filter((f) => f.endsWith(".ndjson"))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

async function readTraceFile(runId: string): Promise<TraceRecord[]> {
  const filePath = resolve(TRACE_DIR, `${runId}.ndjson`);
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as TraceRecord);
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
      const files = await listTraceFiles();
      if (files.length === 0) {
        console.log("No trace files found in", resolve(TRACE_DIR));
        return;
      }
      console.log(`Trace files in ${resolve(TRACE_DIR)}:\n`);
      for (const file of files) {
        const fp = resolve(TRACE_DIR, file);
        const s = await stat(fp);
        const runId = basename(file, ".ndjson");
        const sizeKB = (s.size / 1024).toFixed(1);
        const mtime = s.mtime.toISOString().slice(0, 19).replace("T", " ");
        console.log(`  ${runId}  ${sizeKB}KB  ${mtime}`);
      }
      break;
    }
    case "show": {
      if (!argId) { console.log("Usage: inspector.ts show <runId>"); return; }
      const events = await readTraceFile(argId);
      console.log(`Run: ${argId} (${events.length} events)\n`);
      for (const e of events) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 200)}`);
      }
      break;
    }
    case "errors": {
      if (!argId) { console.log("Usage: inspector.ts errors <runId>"); return; }
      const events = await readTraceFile(argId);
      const errors = events.filter((e) => e.level === "error" || e.level === "warn");
      console.log(`Errors/warnings in ${argId} (${errors.length}):\n`);
      for (const e of errors) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 500)}`);
      }
      break;
    }
    case "layer": {
      const wantedLayer = argId as TraceLayer;
      const runId = process.argv[4];
      if (!wantedLayer || !runId) { console.log("Usage: inspector.ts layer <worker|bridge|client> <runId>"); return; }
      const events = await readTraceFile(runId);
      const filtered = events.filter((e) => e.layer === wantedLayer);
      console.log(`Layer ${wantedLayer} in ${runId} (${filtered.length} events):\n`);
      for (const e of filtered) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) console.log(`       ${JSON.stringify(e.payload).slice(0, 300)}`);
      }
      break;
    }
    case "stats": {
      if (!argId) { console.log("Usage: inspector.ts stats <runId>"); return; }
      const events = await readTraceFile(argId);
      const byLayer: Record<string, number> = {};
      const byLevel: Record<string, number> = {};
      const byEvent: Record<string, number> = {};
      let totalDuration = 0;
      let maxDur = 0;
      let maxDurEvent = "";
      for (const e of events) {
        byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
        byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
        byEvent[e.eventName] = (byEvent[e.eventName] ?? 0) + 1;
        if (e.durationMs != null) {
          totalDuration += e.durationMs;
          if (e.durationMs > maxDur) { maxDur = e.durationMs; maxDurEvent = e.eventName; }
        }
      }
      console.log(`Stats for ${argId} (${events.length} events):\n`);
      console.log("By layer:");
      for (const [l, c] of Object.entries(byLayer)) console.log(`  ${l}: ${c}`);
      console.log("\nBy level:");
      for (const [l, c] of Object.entries(byLevel)) console.log(`  ${l}: ${c}`);
      console.log(`\nTotal timed duration: ${totalDuration}ms`);
      console.log(`Slowest: ${maxDurEvent} (${maxDur}ms)`);
      console.log("\nBy event:");
      for (const [ev, c] of Object.entries(byEvent).sort((a, b) => b[1] - a[1])) console.log(`  ${ev}: ${c}`);
      break;
    }
    default:
      console.log("Usage: npx tsx lib/features/tracing/inspector.ts <command> [args]");
      console.log("Commands:");
      console.log("  list                          List recent trace files");
      console.log("  show <runId>                  Show all events chronologically");
      console.log("  errors <runId>                Show only error/warn events");
      console.log("  layer <worker|bridge|client> <runId>  Show layer-specific events");
      console.log("  stats <runId>                 Event counts, durations, errors by layer");
  }
}

main().catch(console.error);
