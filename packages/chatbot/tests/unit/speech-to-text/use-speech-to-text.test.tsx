// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSpeechToText } from "@/lib/features/speech-to-text/hooks/use-speech-to-text";

// ─── Test doubles ───────────────────────────────────────────────────────────

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = () => true;

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public stream: MediaStream,
    opts?: { mimeType?: string },
  ) {
    this.mimeType = opts?.mimeType ?? "audio/webm";
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    // A real, non-empty segment (well above MIN_SEGMENT_BYTES).
    this.ondataavailable?.({
      data: new Blob(["x".repeat(4000)], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

const makeStream = () => {
  const track = { stop: vi.fn() };
  return {
    getTracks: () => [track],
    _track: track,
  } as unknown as MediaStream;
};

let getUserMedia: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockMediaRecorder.instances = [];
  vi.stubGlobal(
    "MediaRecorder",
    MockMediaRecorder as unknown as typeof MediaRecorder,
  );
  getUserMedia = vi.fn(async () => makeStream());
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ text: "hello world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("useSpeechToText", () => {
  it("reports support when the browser APIs are present", () => {
    const { result } = renderHook(() =>
      useSpeechToText({ onTranscript: vi.fn(), segmentMs: 20 }),
    );
    expect(result.current.isSupported).toBe(true);
  });

  it("records, flushes a segment, and appends the transcript", async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useSpeechToText({ onTranscript, segmentMs: 20 }),
    );

    await act(async () => {
      result.current.toggle();
    });

    await waitFor(() => expect(result.current.isRecording).toBe(true));
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    // Let the segment timer fire, flushing a segment to the BFF.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith("hello world"),
    );

    // The POST goes to the transcribe BFF as multipart form-data.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/transcribe");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("stops recording and releases the microphone", async () => {
    const { result } = renderHook(() =>
      useSpeechToText({ onTranscript: vi.fn(), segmentMs: 10_000 }),
    );

    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => expect(result.current.isRecording).toBe(true));

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.isRecording).toBe(false);
    const stream = getUserMedia.mock.results[0].value as Promise<
      MediaStream & { _track: { stop: ReturnType<typeof vi.fn> } }
    >;
    const resolved = await stream;
    await waitFor(() => expect(resolved._track.stop).toHaveBeenCalled());
  });
});
