import fs from "fs";
import path from "path";
import type { Transcript, TranscriptMessage, CompactionSnapshot, SimulationConfig, SimulationMetrics } from "./types";

const TRANSCRIPTS_DIR = path.resolve(process.cwd(), "scripts/evaluation/transcripts");

export function createTranscriptWriter() {
  let transcript: Transcript | null = null;
  let filePath = "";

  function flush() {
    if (!transcript) throw new Error("Transcript not initialized");
    fs.writeFileSync(filePath, JSON.stringify(transcript, null, 2));
  }

  function init(config: SimulationConfig): Transcript {
    const simulationId = `run-${Date.now()}`;
    transcript = {
      simulationId,
      scenario: config.scenario,
      startedAt: new Date().toISOString(),
      config,
      messages: [],
      compactionSnapshots: [],
      metrics: {
        totalMessages: 0,
        totalUserTokens: 0,
        totalAssistantTokens: 0,
        compactionEvents: 0,
        responses: [],
        tokenCompressionRatios: [],
      },
    };

    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    filePath = path.join(TRANSCRIPTS_DIR, `${simulationId}.json`);
    flush();

    return transcript;
  }

  function appendMessage(message: TranscriptMessage) {
    if (!transcript) throw new Error("Transcript not initialized");
    transcript.messages.push(message);
    flush();
  }

  function appendCompactionSnapshot(snapshot: CompactionSnapshot) {
    if (!transcript) throw new Error("Transcript not initialized");
    transcript.compactionSnapshots.push(snapshot);
    flush();
  }

  function finalize(metrics: SimulationMetrics) {
    if (!transcript) throw new Error("Transcript not initialized");
    transcript.endedAt = new Date().toISOString();
    transcript.metrics = metrics;
    flush();
    return filePath;
  }

  function getTranscript() {
    return transcript;
  }

  return { init, appendMessage, appendCompactionSnapshot, finalize, getTranscript };
}
