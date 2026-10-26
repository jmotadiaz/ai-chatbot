/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { setupMswServer } from "../../helpers/msw-server";
import { useChat } from "@/lib/features/chat/conversation/hooks/use-chat";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

const CHAT_ID = "0b9e6c1e-1111-4222-8333-444455556666";
const ASSISTANT_ID = "assistant-message";

const MODEL: GatewayModelEntry = {
  id: "test-model",
  company: "test",
  isDefault: true,
  contextWindow: 8192,
  maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  thinkingLevels: [],
  defaultThinkingLevel: null,
  supportedFiles: [],
  supportedOutput: ["text"],
  zeroDataRetention: false,
  temperature: null,
  topP: null,
  topK: null,
};

const userMessage = (text: string): ChatbotMessage => ({
  id: "user-message",
  role: "user",
  parts: [{ type: "text", text }],
  metadata: { status: "finished" },
});

// ---------------------------------------------------------------------------
// SSE builders — the frames mirror what the server's registry replays: the
// stream ALWAYS starts with the original `start` chunk (same messageId), which
// is what makes a full replay replace the partial message instead of adding a
// second one.
// ---------------------------------------------------------------------------

const startChunk = (messageId: string) => ({ type: "start", messageId });
const textStart = (id = "t1") => ({ type: "text-start", id });
const textDelta = (delta: string, id = "t1") => ({
  type: "text-delta",
  id,
  delta,
});
const textEnd = (id = "t1") => ({ type: "text-end", id });
const finishChunk = { type: "finish" };

interface OpenStreamOptions {
  /**
   * Called with the stream's controller actions as soon as the response is
   * built, so a test can decide when the fetch body dies (screen off) or
   * completes gracefully.
   */
  onOpen?: (actions: { kill: () => void; complete: () => void }) => void;
}

function makeSseResponse(chunks: object[], options?: OpenStreamOptions): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const actions = {
        kill: () =>
          controller.error(
            // What a real browser produces when the SSE body dies: a network
            // failure, not an SDK abort — the turn must stay resumable.
            Object.assign(new TypeError("Failed to fetch"), { name: "TypeError" }),
          ),
        complete: () => {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // Already closed.
          }
        },
      };
      for (const c of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
      }
      options?.onOpen?.(actions);
      if (!options?.onOpen) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream" },
  });
}

const fullReplay = (text: string): object[] => [
  startChunk(ASSISTANT_ID),
  textStart(),
  textDelta(text),
  textEnd(),
  finishChunk,
];

// ---------------------------------------------------------------------------
// Harness: the REAL useChat stack (useChatSession + transport + resume hook)
// is the seam under test; only the HTTP boundary is mocked with MSW.
// ---------------------------------------------------------------------------

interface HarnessProps {
  chatId?: string;
  preventChatPersistence?: boolean;
  initialMessages?: ChatbotMessage[];
}

function Harness({ chatId, preventChatPersistence, initialMessages }: HarnessProps) {
  const chat = useChat({
    chatId,
    preventChatPersistence,
    initialMessages,
    selectedModel: "test-model",
  });
  const assistantMessages = chat.messages.filter((m) => m.role === "assistant");
  const assistantText = assistantMessages
    .map((m) =>
      m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""),
    )
    .join("|");
  return (
    <div>
      <p data-testid="status">{chat.status}</p>
      <p data-testid="error">{chat.error?.message ?? ""}</p>
      <p data-testid="assistant-text">{assistantText}</p>
      <p data-testid="assistant-count">{assistantMessages.length}</p>
      <button data-testid="type" onClick={() => chat.setInput("hello")}>
        type
      </button>
      <button
        data-testid="send"
        onClick={() =>
          void chat.handleSubmit(
            new Event("submit", { cancelable: true }) as unknown as React.FormEvent<HTMLFormElement>,
          )
        }
      >
        send
      </button>
    </div>
  );
}

const renderHarness = (props: HarnessProps = {}) =>
  render(
    <ModelCatalogProvider catalog={[MODEL]}>
      <NuqsTestingAdapter searchParams="">
        <Harness {...props} />
      </NuqsTestingAdapter>
    </ModelCatalogProvider>,
  );

const fireVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  return act(async () => {
    fireEvent(document, new Event("visibilitychange"));
  });
};

const firePageShow = (persisted: boolean) =>
  act(async () => {
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted }));
  });

const flush = () => new Promise((resolve) => setTimeout(resolve, 25));

// ---------------------------------------------------------------------------
// Request capture
// ---------------------------------------------------------------------------

let postBodies: Record<string, unknown>[];
let resumeGets: string[];

const isTurnResume = (url: string) => !url.includes(`${CHAT_ID}/stream`);

const streamKeyGets = () => resumeGets.filter(isTurnResume);

const setupServer = setupMswServer(
  http.post("*/api/chat", async ({ request }) => {
    postBodies.push((await request.json()) as Record<string, unknown>);
    return makeSseResponse(fullReplay("hello from the model"));
  }),
  http.get("*/api/chat/*/stream", ({ request }) => {
    resumeGets.push(request.url);
    // Nothing live: the "silent nothing to resume" signal.
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeEach(() => {
  postBodies = [];
  resumeGets = [];
});

afterEach(() => {
  cleanup();
});

describe("useChat resume lifecycle", () => {
  it("resumes exactly once on visibilitychange after the POST stream dies mid-generation and completes the message", async () => {
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        return makeSseResponse(fullReplay("Partial world"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });

    // Mount-time resume (`resume: true`): the chatId-indexed GET answers 204.
    await waitFor(() => expect(resumeGets).toHaveLength(1));
    expect(new URL(resumeGets[0]!).pathname).toBe(`/api/chat/${CHAT_ID}/stream`);

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    // The POST carried the per-turn streamKey (a uuid) and the chat id.
    await waitFor(() => expect(postBodies).toHaveLength(1));
    const streamKey = postBodies[0]!.streamKey as string;
    expect(streamKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(postBodies[0]!.chatId).toBe(CHAT_ID);

    // Partial text streamed in before the "screen off" kills the body.
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe("Partial "),
    );

    act(() => {
      killStream!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));

    // Screen on: exactly ONE GET to the turn's resume route (the per-turn
    // streamKey URL, not the chatId URL), then the replay completes the
    // message without duplicating it.
    await fireVisibility("visible");

    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    expect(new URL(streamKeyGets()[0]!).pathname).toBe(
      `/api/chat/${streamKey}/stream`,
    );
    expect(streamKeyGets()).toHaveLength(1); // no retries beyond the one event

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Partial world",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
  });

  it("resumes on a bfcache pageshow (persisted: true) but not on the initial-load pageshow (persisted: false)", async () => {
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        return makeSseResponse(fullReplay("Partial world"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1)); // mount resume (204)

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));
    const streamKey = postBodies[0]!.streamKey as string;

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe("Partial "),
    );
    act(() => {
      killStream!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));

    // The `pageshow` browsers fire on a normal load (`persisted: false`) is
    // NOT a resume trigger: `resume: true` already resumed on mount.
    await firePageShow(false);
    await flush();
    expect(streamKeyGets()).toHaveLength(0);

    // A bfcache restore (`persisted: true`) resumes exactly once.
    await firePageShow(true);
    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    expect(new URL(streamKeyGets()[0]!).pathname).toBe(
      `/api/chat/${streamKey}/stream`,
    );

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Partial world",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
  });

  it("treats a 204 from the resume route as silent: status settles to ready, no new error, messages unchanged", async () => {
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      // Default handler: 204.
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe("Partial "),
    );
    act(() => {
      killStream!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(screen.getByTestId("error").textContent).toBe("Failed to fetch");

    await fireVisibility("visible");

    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    await flush();
    // The 204 is silent: status ready, NO error state left behind, no retry
    // GETs, and the partial message is left exactly as it was.
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("error").textContent).toBe("");
    expect(screen.getByTestId("assistant-text").textContent).toBe("Partial ");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    expect(streamKeyGets()).toHaveLength(1);
  });

  it("survives N successive reconnects with a single assistant message", async () => {
    let killPost: (() => void) | undefined;
    let killResume: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killPost = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        if (streamKeyGets().length === 1) {
          // First reconnect: tails the still-live stream, then the screen
          // goes off again and kills it mid-generation.
          return makeSseResponse(
            [
              startChunk(ASSISTANT_ID),
              textStart(),
              textDelta("Partial "),
              textDelta("A"),
            ],
            { onOpen: ({ kill }) => (killResume = kill) },
          );
        }
        // Second reconnect: the turn is over server-side; the full replay
        // completes the message.
        return makeSseResponse(fullReplay("Partial AB"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe("Partial "),
    );

    // First screen off → first reconnect.
    act(() => {
      killPost!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    await fireVisibility("visible");
    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe("Partial A"),
    );

    // Second screen off (the tailing GET dies) → second reconnect.
    act(() => {
      killResume!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    await fireVisibility("visible");
    await waitFor(() => expect(streamKeyGets()).toHaveLength(2));

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Partial AB",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
  });

  it("re-attaches to the live stream on mount via resume: true (remount / paste-URL)", async () => {
    setupServer.use(
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        return makeSseResponse(fullReplay("Resumed from the server"));
      }),
    );

    renderHarness({ chatId: CHAT_ID, initialMessages: [userMessage("hello")] });

    // Exactly ONE GET on mount (the chatId URL — no turn key is pending), and
    // no duplicate resumes.
    await waitFor(() => expect(resumeGets).toHaveLength(1));
    expect(new URL(resumeGets[0]!).pathname).toBe(`/api/chat/${CHAT_ID}/stream`);
    await flush();
    expect(resumeGets).toHaveLength(1);

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Resumed from the server",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    expect(postBodies).toHaveLength(0); // a resume never re-sends the turn
  });

  it("never opts non-persisted chats into resume: no streamKey in the POST, no stream GET on visibility/pageshow", async () => {
    setupServer.use(
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        return makeSseResponse(fullReplay("should never be requested"));
      }),
    );

    renderHarness({ preventChatPersistence: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]).not.toHaveProperty("streamKey");
    expect(postBodies[0]!.chatId).toBeFalsy();
    expect(postBodies[0]!.preventChatPersistence).toBe(true);

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "hello from the model",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");

    // No mount resume, no visibility/pageshow resume: the stream route is
    // never contacted.
    await fireVisibility("visible");
    await firePageShow(true);
    await flush();
    expect(resumeGets).toHaveLength(0);
  });

  it("does not resume while the POST stream is still alive and does not disturb it", async () => {
    let completePost: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(fullReplay("hello from the model"), {
          onOpen: ({ complete }) => (completePost = complete),
        });
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1)); // mount resume (204)

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("streaming"));

    // Screen off + on while the POST is alive: no resume GET, and the
    // in-flight stream keeps flowing.
    await fireVisibility("hidden");
    await fireVisibility("visible");
    await flush();
    expect(streamKeyGets()).toHaveLength(0);
    expect(resumeGets).toHaveLength(1);

    completePost!();
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "hello from the model",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(streamKeyGets()).toHaveLength(0);
  });

  it("resumes a fetch killed while hidden when the visible event landed while the stream was still alive", async () => {
    // Real-browser sequence: the page freezes while hidden, the OS/browser
    // kills the fetch, and the JS rejection (`TypeError: Failed to fetch`)
    // is delivered only AFTER the page resumes — often after the
    // `visibilitychange` listener has already run against a still-"streaming"
    // status. The visible event must therefore record an INTENT that the
    // status settling out of the in-flight states consumes.
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        return makeSseResponse(fullReplay("Partial world"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1)); // mount resume (204)

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));
    const streamKey = postBodies[0]!.streamKey as string;

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("streaming"));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe("Partial "),
    );

    // The visible event arrives WHILE the stream is still alive…
    await fireVisibility("visible");
    await flush();
    expect(streamKeyGets()).toHaveLength(0); // never abort a live request

    // …and THEN the killed fetch's rejection is delivered (page now visible).
    act(() => {
      killStream!();
    });

    // The intent is consumed when the status settles out of `streaming`:
    // exactly ONE GET to the turn's resume route, and the replay completes
    // the message (single assistant message).
    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    expect(new URL(streamKeyGets()[0]!).pathname).toBe(
      `/api/chat/${streamKey}/stream`,
    );

    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Partial world",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    await flush();
    expect(streamKeyGets()).toHaveLength(1); // no retries beyond the one intent
  });

  it("does not auto-resume when the stream dies while visible with no visibility event", async () => {
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        return makeSseResponse(fullReplay("Partial world"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1)); // mount resume (204)

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("streaming"));
    // The user is LOOKING at the screen when the stream dies: error + toast,
    // no automatic resume (a resume requires a visibility/pageshow event).
    act(() => {
      killStream!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    await flush();

    expect(streamKeyGets()).toHaveLength(0);
    expect(screen.getByTestId("status").textContent).toBe("error");
  });

  it("drops the resume intent when the page is hidden again before the status settles", async () => {
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        return makeSseResponse(fullReplay("Partial world"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1)); // mount resume (204)

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));
    const streamKey = postBodies[0]!.streamKey as string;

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("streaming"));

    // Visible while streaming records an intent; hiding again drops it, so
    // the killed fetch afterwards must NOT be resumed.
    await fireVisibility("visible");
    await fireVisibility("hidden");
    act(() => {
      killStream!();
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    await flush();
    expect(streamKeyGets()).toHaveLength(0);

    // The next visibility event records a fresh intent: exactly one resume.
    await fireVisibility("visible");
    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    expect(new URL(streamKeyGets()[0]!).pathname).toBe(
      `/api/chat/${streamKey}/stream`,
    );
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Partial world",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    await flush();
    expect(streamKeyGets()).toHaveLength(1);
  });

  it("records at most one resume intent from two rapid visible events during the same in-flight stream", async () => {
    let killStream: (() => void) | undefined;
    setupServer.use(
      http.post("*/api/chat", async ({ request }) => {
        postBodies.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse(
          [startChunk(ASSISTANT_ID), textStart(), textDelta("Partial ")],
          { onOpen: ({ kill }) => (killStream = kill) },
        );
      }),
      http.get("*/api/chat/*/stream", ({ request }) => {
        resumeGets.push(request.url);
        if (postBodies.length === 0) {
          return new HttpResponse(null, { status: 204 }); // mount: nothing live
        }
        return makeSseResponse(fullReplay("Partial world"));
      }),
    );

    renderHarness({ chatId: CHAT_ID });
    await waitFor(() => expect(resumeGets).toHaveLength(1)); // mount resume (204)

    await act(async () => {
      fireEvent.click(screen.getByTestId("type"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(postBodies).toHaveLength(1));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("streaming"));

    // Two rapid visible events while the same request is still alive: ONE
    // intent, ONE resume after the killed fetch settles.
    await fireVisibility("visible");
    await fireVisibility("visible");
    act(() => {
      killStream!();
    });

    await waitFor(() => expect(streamKeyGets()).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("assistant-text").textContent).toBe(
        "Partial world",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    await flush();
    expect(streamKeyGets()).toHaveLength(1); // no double resume, no retry
  });
});
