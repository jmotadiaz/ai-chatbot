import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";
// Single source of truth for the paced capability served by the mock gateway.
import { SLOW_STREAM_TEXT } from "@/tests/mocks/gateway/server";

/**
 * E2E acceptance for chat resume (spec "Criterio de aceptación"):
 *
 * A turn's generation lives server-side (the POST tees its SSE into the resume
 * registry), so a client that loses its fetch mid-generation — the screen went
 * off, the browser was backgrounded and the OS killed the connection — can
 * re-attach and receive the rest of the stream, or the whole message, without
 * any further user action.
 */

const SEED_QUESTION = "Seed question for the resume suite.";
const SEED_ANSWER = "Seed answer for the resume suite.";
const SLOW_PROMPT = "Tell me a long, slow story.";

/**
 * A prefix of the `slowStream` script that is already on screen while the
 * turn is still generating (`smoothStream()` may split it mid-word).
 */
const FIRST_SLOW_CHUNK = "SLOW chunk";

interface LoggedRequest {
  method: string;
  pathname: string;
  body: string | null;
}

const pathnameOf = (url: string): string => new URL(url).pathname;

const isChatPost = (entry: LoggedRequest): boolean =>
  entry.method === "POST" && entry.pathname === "/api/chat";

const isStreamGet = (entry: LoggedRequest): boolean =>
  entry.method === "GET" && /^\/api\/chat\/[^/]+\/stream$/.test(entry.pathname);

/** Requests issued by the page; listeners survive a reload on the same Page. */
function recordRequests(page: Page): LoggedRequest[] {
  const log: LoggedRequest[] = [];
  page.on("request", (request) => {
    log.push({
      method: request.method(),
      pathname: pathnameOf(request.url()),
      body: request.postData(),
    });
  });
  return log;
}

/**
 * Simulates the OS/browser killing the in-flight streaming fetch on a frozen
 * page.
 *
 * `context.setOffline(true)` was measured NOT to kill an in-flight streaming
 * fetch in Chromium (a loopback connection keeps delivering bytes), so the
 * honest simulation is wrapping `window.fetch`: the FIRST `POST /api/chat`
 * gets a `Response` whose body forwards a few SSE frames and then fails with
 * the exact rejection a killed fetch produces (`TypeError: Failed to fetch` —
 * mapped by the SDK to a disconnect: `status: "error"`, the turn stays
 * pending, the server keeps generating).
 */
const KILL_FIRST_CHAT_POST = `
  (() => {
    const original = window.fetch.bind(window);
    let intercepted = false;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      const method = (init && init.method) || (input && input.method) || "GET";
      const isTarget = !intercepted && method === "POST" && url.includes("/api/chat");
      if (!isTarget) return original(input, init);
      intercepted = true;

      const response = await original(input, init);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let frames = 0;

      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
          buffered += decoder.decode(value, { stream: true });
          frames = buffered.split("\\n\\n").length - 1;
          if (frames >= 6) {
            await reader.cancel().catch(() => {});
            controller.error(new TypeError("Failed to fetch"));
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        headers: response.headers,
      });
    };
  })();
`;

/** A real page cannot flip `visibilityState`: redefine it and dispatch. */
async function simulateScreenBackOn(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const slowAssistantOf = (chatPage: ChatPage) =>
  chatPage.chat.assistantMessages.filter({ hasText: "SLOW chunk" });

async function seedChat(db: {
  addChats: (chats: Array<{
    title: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }>) => Promise<Array<{ id: string }>>;
}): Promise<{ id: string }> {
  const [chat] = await db.addChats([
    {
      title: "Resume suite chat",
      messages: [
        { role: "user", content: SEED_QUESTION },
        { role: "assistant", content: SEED_ANSWER },
      ],
    },
  ]);
  return chat!;
}

test.describe("Chat resume", () => {
  test("screen off mid-generation: the turn completes without further user action", async ({
    page,
    db,
  }) => {
    const chat = await seedChat(db);
    await page.addInitScript(KILL_FIRST_CHAT_POST);
    const requests = recordRequests(page);

    const chatPage = new ChatPage(page);
    // No mount probe on a normal `goto`: the mount resume only fires on a
    // reload/back_forward navigation, so nothing can race the turn.
    await chatPage.goto(chat.id);
    await chatPage.header.modelPicker.selectModel("slowStream");
    await chatPage.chat.sendMessage(SLOW_PROMPT);

    // The fetch died mid-body: part of the text is on screen and the client
    // knows the turn was interrupted.
    const slowAssistant = slowAssistantOf(chatPage);
    await expect(slowAssistant).toHaveCount(1);
    await expect(slowAssistant.first()).toContainText(FIRST_SLOW_CHUNK);

    // The POST carried this turn's key, so the resume targets the exact stream.
    const posts = requests.filter(isChatPost);
    expect(posts).toHaveLength(1);
    const { streamKey } = JSON.parse(posts[0]!.body ?? "{}") as {
      streamKey?: string;
    };
    expect(typeof streamKey).toBe("string");
    const resumePathname = `/api/chat/${streamKey}/stream`;

    // The screen comes back on: no clicks, no retyping.
    await simulateScreenBackOn(page);

    // The client re-attaches to the turn's stream…
    await expect
      .poll(
        () => requests.some((r) => isStreamGet(r) && r.pathname === resumePathname),
        { timeout: 10_000 },
      )
      .toBe(true);

    // …and the SAME single assistant message reaches the full scripted text.
    await expect(slowAssistant).toHaveCount(1);
    await expect(slowAssistant.first()).toContainText(SLOW_STREAM_TEXT, {
      timeout: 20_000,
    });
  });

  test("reload mid-generation: the remount re-attaches instead of restarting", async ({
    page,
    db,
  }) => {
    const chat = await seedChat(db);
    const requests = recordRequests(page);

    const chatPage = new ChatPage(page);
    await chatPage.goto(chat.id);
    await chatPage.header.modelPicker.selectModel("slowStream");
    await chatPage.chat.sendMessage(SLOW_PROMPT);

    const slowAssistant = slowAssistantOf(chatPage);
    await expect(slowAssistant).toHaveCount(1);
    await expect(slowAssistant.first()).toContainText(FIRST_SLOW_CHUNK);

    // A brand-new chat would resume a client-only draft id, so this scenario
    // uses the persisted chat: its id is in the URL and in the POST body.
    await page.reload();

    await expect(slowAssistant).toHaveCount(1);
    await expect(slowAssistant.first()).toContainText(SLOW_STREAM_TEXT, {
      timeout: 20_000,
    });

    // Exactly ONE POST across the reload: the response was re-attached, not
    // regenerated.
    const posts = requests.filter(isChatPost);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]!.body ?? "{}")).toMatchObject({
      chatId: chat.id,
    });
    expect(requests.filter(isStreamGet).length).toBeGreaterThan(0);
  });

  test("resume with no in-flight turn: no probe on navigation, 204 on reload, stays ready", async ({
    page,
    db,
  }) => {
    const chat = await seedChat(db);
    const requests = recordRequests(page);
    const chatPage = new ChatPage(page);

    // A normal chat open issues NO stream GET at all: the mount resume is
    // gated to reload/back_forward navigations.
    await chatPage.goto(chat.id);
    await expect(chatPage.chat.chatInput).toBeEditable();
    expect(requests.filter(isStreamGet)).toHaveLength(0);

    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await expect(chatPage.chat.loadingIndicator).not.toBeVisible();
    await expect(
      chatPage.chat.assistantMessages.filter({ hasText: SEED_ANSWER }),
    ).toHaveCount(1);

    // A genuine reload DOES probe: the registry answers `204` (nothing in
    // flight) and the UI settles to `ready` with no error.
    const reloadProbe = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /^\/api\/chat\/[^/]+\/stream$/.test(pathnameOf(response.url())),
    );
    await page.reload();
    expect((await reloadProbe).status()).toBe(204);

    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await expect(chatPage.chat.loadingIndicator).not.toBeVisible();
    await expect(
      chatPage.chat.assistantMessages.filter({ hasText: SEED_ANSWER }),
    ).toHaveCount(1);
    await expect(chatPage.chat.chatInput).toBeEditable();

    // Exactly the one reload probe: the silent `204` left no pending turn.
    expect(requests.filter(isStreamGet)).toHaveLength(1);
  });
});
