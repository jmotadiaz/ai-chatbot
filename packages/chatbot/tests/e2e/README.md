# Playwright E2E Tests

This directory holds the project's end-to-end (E2E) tests using Playwright.

## Structure

```
tests/
├── fixtures.ts      # Fixtures for dependency injection (AI providers and DB mocks)
├── chat-page.ts     # Page Object Model for the chat
├── chat.spec.ts     # E2E tests for the chat
├── example.spec.ts  # Basic Playwright example
└── README.md        # This documentation
```

## Fixtures

The fixtures use dependency injection to replace the real services with mocks during the tests:

### AI Providers Mock
- Uses `MockLanguageModelV2` and `MockEmbeddingModelV2` from the Vercel AI SDK
- The models return predictable responses for testing
- It is configured through `setProviders()` from `lib/ai/models/providers`
- Each mock includes the `modelId` in the response

### Database Mock
- Uses `drizzle.mock()` with the application schema
- It is configured through `setDb()` from `lib/db/db`

## Running Tests

```bash
# Run all tests
pnpm test:e2e

# Run tests with the interactive UI
pnpm test:e2e:ui

# Run tests with a visible browser
pnpm test:e2e:headed

# Run a specific test
pnpm test:e2e tests/chat.spec.ts
```

## Page Objects

### ChatPage

The Page Object Model encapsulates the interactions with the chat interface:

**Main methods:**
- `goto(chatId?)` - Navigates to the chat page
- `sendMessage(message)` - Sends a message (types + submits)
- `typeMessage(message)` - Types a message without sending it
- `submitMessage()` - Submits the current message
- `waitForAssistantResponse()` - Waits for the assistant's response
- `waitForLoadingComplete()` - Waits for loading to finish
- `verifyAssistantResponded()` - Checks that the assistant responded
- `verifyAssistantResponseContains(text)` - Checks that the response contains specific text
- `getLastAssistantMessage()` - Gets the last assistant message
- `getUserMessages()` - Gets all user messages
- `getAssistantMessages()` - Gets all assistant messages
- `isChatInputEnabled()` - Checks whether the input is enabled

## Writing New Tests

```typescript
import { test, expect } from "./fixtures";
import { ChatPage } from "./chat-page";

test.describe("My feature", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, mockProviders, testDb }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    
    // The fixtures are available for verification
    expect(mockProviders).toBeDefined();
    expect(testDb).toBeDefined();
  });

  test("my test", async () => {
    await chatPage.sendMessage("Hello");
    await chatPage.waitForAssistantResponse();
    
    await chatPage.verifyAssistantResponded();
  });
});
```

## Configuration

The Playwright configuration lives in `playwright.config.mts`:
- **Base URL**: `http://localhost:3000`
- **Web Server**: Automatically starts `pnpm dev` before the tests
- **Timeout**: 120 seconds for the server to be ready
- **Browsers**: Chromium, Firefox, WebKit
- **Retry**: 2 retries in CI, 0 locally

## Current Test: Chat

The first test (`chat.spec.ts`) checks:
1. The user can send a query to the chat
2. The assistant answers correctly
3. The response contains the expected mock text
4. The messages are shown in the interface

## Notes

- The tests require the development server to be running, otherwise it is started automatically
- The mocks replace the AI providers and the database for isolated and predictable tests
- Using Page Objects is recommended to keep the tests maintainable and reduce duplication
- The selectors in ChatPage may need adjustments according to the current data-* attributes of the HTML
