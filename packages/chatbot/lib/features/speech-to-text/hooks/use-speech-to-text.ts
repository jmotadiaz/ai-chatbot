"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Records the microphone and turns it into text incrementally.
 *
 * We can't stream a single MediaRecorder chunk to the transcription API — only
 * a complete container is decodable — so we run a restart loop: record for
 * `segmentMs`, stop to flush a self-contained audio file, transcribe it via the
 * BFF, and immediately start the next segment. Each returned transcript is
 * appended to the textarea, giving a live "streaming" feel while keeping the
 * whole feature on the client + BFF (the worker only receives final text).
 */
export interface UseSpeechToTextParams {
  /** Called with each transcribed text segment, in order. */
  onTranscript: (text: string) => void;
  /** BFF endpoint. Defaults to the transcribe route. */
  api?: string;
  /** Length of each audio segment before it is flushed for transcription. */
  segmentMs?: number;
}

export interface UseSpeechToTextReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  toggle: () => void;
  stop: () => void;
}

const DEFAULT_SEGMENT_MS = 4000;
// Segments smaller than this are effectively silence/headers only; skip them
// to avoid spurious hallucinated transcripts and wasted requests.
const MIN_SEGMENT_BYTES = 1200;

const pickMimeType = (): string | undefined => {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
};

export const useSpeechToText = ({
  onTranscript,
  api = "/api/transcribe",
  segmentMs = DEFAULT_SEGMENT_MS,
}: UseSpeechToTextParams): UseSpeechToTextReturn => {
  const [isSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined",
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Refs so the recorder callbacks always read live values without re-binding.
  const recordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(0);
  // Tracks whether the user *wants* to be recording, so an in-flight
  // getUserMedia permission grant that resolves after a toggle-off is cleaned
  // up instead of leaking an open microphone.
  const isRecordingIntentRef = useRef(false);
  // Serialize transcriptions so appended text keeps the spoken order even when
  // requests overlap.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<string> => {
      const form = new FormData();
      form.append("audio", blob, "segment");
      const response = await fetch(api, { method: "POST", body: form });
      if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
      }
      const { text } = (await response.json()) as { text?: string };
      return (text ?? "").trim();
    },
    [api],
  );

  const enqueueTranscription = useCallback(
    (blob: Blob) => {
      pendingRef.current += 1;
      setIsTranscribing(true);
      queueRef.current = queueRef.current
        .then(() => transcribeBlob(blob))
        .then((text) => {
          if (text) onTranscriptRef.current(text);
        })
        .catch((error) => {
          console.error("Error transcribing audio segment:", error);
          toast.error("Could not transcribe audio");
        })
        .finally(() => {
          pendingRef.current -= 1;
          if (pendingRef.current === 0) setIsTranscribing(false);
        });
    },
    [transcribeBlob],
  );

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !recordingRef.current) return;

    const recorder = new MediaRecorder(
      stream,
      mimeRef.current ? { mimeType: mimeRef.current } : undefined,
    );
    recorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      // Chain the next segment first to minimize the gap where audio is lost.
      if (recordingRef.current) {
        startSegment();
      } else {
        releaseStream();
      }
      const blob = new Blob(chunks, {
        type: recorder.mimeType || mimeRef.current,
      });
      if (blob.size >= MIN_SEGMENT_BYTES) enqueueTranscription(blob);
    };

    recorder.start();
    timerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, segmentMs);
  }, [enqueueTranscription, releaseStream, segmentMs]);

  const stop = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    // Flush the final partial segment; the stream is released in onstop.
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      releaseStream();
    }
  }, [releaseStream]);

  const start = useCallback(async () => {
    if (recordingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone is not available in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The user may have toggled off while the permission prompt was open;
      // release the mic we just acquired and bail instead of leaking it.
      if (!isRecordingIntentRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      mimeRef.current = pickMimeType();
      recordingRef.current = true;
      setIsRecording(true);
      startSegment();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access the microphone");
    }
  }, [startSegment]);

  const toggle = useCallback(() => {
    if (recordingRef.current) {
      isRecordingIntentRef.current = false;
      stop();
    } else {
      isRecordingIntentRef.current = true;
      void start();
    }
  }, [start, stop]);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(
    () => () => {
      recordingRef.current = false;
      isRecordingIntentRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  return { isRecording, isTranscribing, isSupported, toggle, stop };
};
